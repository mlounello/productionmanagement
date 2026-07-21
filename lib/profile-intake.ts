import { createHash, createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { renderTemplate,sendHtmlEmail } from "@/lib/outbound-email";
import { activeEmailTemplate } from "@/lib/email-template-catalog";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { profileIntakeHmacSecret } from "@/lib/profile-intake-secret";

export type IntakeContext = "audition" | "technical_interest";
export type ReusableProfile = {
  id: string; full_name: string; preferred_name: string; email: string; vendor_number: string; phone: string; pronouns: string; affiliation: string;
  performance_interests: string[]; technical_interests: string[]; vocal_range: string; instruments: string; special_skills: string;
  performance_experience: string; technical_experience: string; certifications_training: string; dance_styles: string[]; dance_experience: string;
};

export type ProfileEnrichment = Partial<Omit<ReusableProfile, "id">>;

const CODE_MINUTES = 10;
const SESSION_MINUTES = 60;

function secret() {
  return profileIntakeHmacSecret(process.env);
}

function codeHash(challengeId: string, code: string) {
  return createHmac("sha256", secret()).update(`${challengeId}:${code}`).digest("hex");
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function cleanArray(value: unknown): string[] {
  return [...new Set((Array.isArray(value) ? value : []).map(String).map((item) => item.trim()).filter(Boolean))];
}

export async function requestProfileVerificationCode(input: { contextType: IntakeContext; contextId: string; email: string; vendorNumber?: string }) {
  const admin = createSupabaseAdminClient();
  const email = input.email.trim().toLowerCase();
  let query = admin.from("people").select("id, full_name, preferred_name, email, vendor_number").ilike("email", email).limit(1);
  if (input.vendorNumber?.trim()) query = query.eq("vendor_number", input.vendorNumber.trim());
  const { data: person } = await query.maybeSingle();
  if (!person) return { sent: false, challengeId: randomUUID() };

  const { data: recent } = await admin.from("profile_verification_codes").select("id, created_at").eq("person_id", person.id).eq("context_type", input.contextType).eq("context_id", input.contextId).is("consumed_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (recent && Date.now() - new Date(recent.created_at).getTime() < 60_000) return { sent: true, challengeId: String(recent.id) };

  const challengeId = randomUUID();
  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + CODE_MINUTES * 60_000).toISOString();
  const { error } = await admin.from("profile_verification_codes").insert({ id: challengeId, person_id: person.id, context_type: input.contextType, context_id: input.contextId, email, code_hash: codeHash(challengeId, code), expires_at: expiresAt });
  if (error) throw new Error(error.message);
  try {
    const template=await activeEmailTemplate("profile_verification_code");const variables={person_name:String(person.preferred_name||person.full_name),verification_code:code,expires_in:`${CODE_MINUTES} minutes`};
    await sendHtmlEmail({
      to: email,
      subject: template?renderTemplate(template.subject_template,variables):"Your Siena Theatre profile verification code",
      html: template?renderTemplate(template.body_template,variables,true):`<h1>Siena Theatre Production Management</h1><p>Hello ${variables.person_name},</p><p>Enter this code to load your saved profile information:</p><h2>${code}</h2><p>The code expires in ${CODE_MINUTES} minutes.</p>`
    });
  } catch (sendError) {
    await admin.from("profile_verification_codes").delete().eq("id", challengeId);
    throw sendError;
  }
  return { sent: true, challengeId };
}

export async function verifyProfileCode(input: { challengeId: string; code: string; contextType: IntakeContext; contextId: string }) {
  const admin = createSupabaseAdminClient();
  const { data: challenge } = await admin.from("profile_verification_codes").select("*").eq("id", input.challengeId).eq("context_type", input.contextType).eq("context_id", input.contextId).maybeSingle();
  if (!challenge || challenge.consumed_at || new Date(challenge.expires_at).getTime() < Date.now()) throw new Error("This verification code has expired. Request a new code.");
  if (Number(challenge.attempts) >= 5) throw new Error("Too many incorrect attempts. Request a new code.");
  if (challenge.code_hash !== codeHash(input.challengeId, input.code.trim())) {
    await admin.from("profile_verification_codes").update({ attempts: Number(challenge.attempts) + 1 }).eq("id", challenge.id);
    throw new Error("That verification code is incorrect.");
  }
  const token = randomBytes(32).toString("base64url");
  await admin.from("profile_verification_codes").update({ consumed_at: new Date().toISOString() }).eq("id", challenge.id);
  const { error } = await admin.from("public_profile_sessions").insert({ person_id: challenge.person_id, context_type: input.contextType, context_id: input.contextId, token_hash: tokenHash(token), expires_at: new Date(Date.now() + SESSION_MINUTES * 60_000).toISOString() });
  if (error) throw new Error(error.message);
  return token;
}

export async function getVerifiedProfile(sessionToken: string | null | undefined, contextType: IntakeContext, contextId: string): Promise<ReusableProfile | null> {
  if (!sessionToken) return null;
  const admin = createSupabaseAdminClient();
  const { data: session } = await admin.from("public_profile_sessions").select("id, person_id, expires_at").eq("token_hash", tokenHash(sessionToken)).eq("context_type", contextType).eq("context_id", contextId).maybeSingle();
  if (!session || new Date(session.expires_at).getTime() < Date.now()) return null;
  const { data: person } = await admin.from("people").select("id, full_name, preferred_name, email, vendor_number, phone, pronouns, affiliation, performance_interests, technical_interests, vocal_range, instruments, special_skills, performance_experience, technical_experience, certifications_training, dance_styles, dance_experience").eq("id", session.person_id).maybeSingle();
  if (!person) return null;
  await admin.from("public_profile_sessions").update({ last_used_at: new Date().toISOString() }).eq("id", session.id);
  return { ...person, performance_interests: cleanArray(person.performance_interests), technical_interests: cleanArray(person.technical_interests), dance_styles: cleanArray(person.dance_styles) } as ReusableProfile;
}

export async function applyProfileEnrichment(input: { personId: string; sourceType: "audition" | "technical_interest" | "staff_update"; sourceId?: string; values: ProfileEnrichment }) {
  const admin = createSupabaseAdminClient();
  const { data: current, error: readError } = await admin.from("people").select("*").eq("id", input.personId).maybeSingle();
  if (readError || !current) throw new Error(readError?.message ?? "Profile not found.");
  const scalarKeys = ["full_name","preferred_name","phone","pronouns","affiliation","vocal_range","instruments","special_skills","performance_experience","technical_experience","certifications_training","dance_experience"] as const;
  const update: Record<string, unknown> = {};
  for (const key of scalarKeys) {
    const value = input.values[key];
    if (typeof value === "string" && value.trim()) update[key] = value.trim();
  }
  if (typeof input.values.email === "string" && input.values.email.trim()) update.email = input.values.email.trim().toLowerCase();
  for (const key of ["performance_interests","technical_interests","dance_styles"] as const) {
    const submitted = cleanArray(input.values[key]);
    if (submitted.length) update[key] = [...new Set([...cleanArray(current[key]), ...submitted])];
  }
  const { error } = await admin.from("people").update(update).eq("id", input.personId);
  if (error) throw new Error(error.message);
  await admin.from("profile_intake_history").insert({ person_id: input.personId, source_type: input.sourceType, source_id: input.sourceId ?? null, submitted_values: input.values, applied_values: update });
  return update;
}
