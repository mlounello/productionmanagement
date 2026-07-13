import { createHash, randomBytes } from "node:crypto";
import { SITE_URL } from "@/lib/config";
import { sendHtmlEmail, renderTemplate } from "@/lib/outbound-email";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const LINK_LIFETIME_DAYS = 7;
const DEFAULT_SUBJECT = "Your secure Siena Theatre production profile link";
const DEFAULT_BODY = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#24352e">
<h1 style="color:#006b54">Siena Theatre Production Management</h1>
<p>Hello {{person_name}},</p>
<p>You have been invited to review and update your Siena Theatre production profile, including your contact information, publicity bio, and headshot.</p>
<p style="margin:32px 0"><a href="{{profile_access_url}}" style="background:#006b54;color:#fff;padding:14px 22px;border-radius:6px;text-decoration:none;font-weight:bold">Open My Production Profile</a></p>
<p>The access page will ask you to press Continue before opening your private session. No password or account setup is required.</p>
<p>This link expires in {{expires_in}} and should not be forwarded. If you did not expect this message, you may safely ignore it.</p>
<p>Thank you,<br>Siena Theatre</p>
</div>`;

export function hashProfileAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function activeTemplate() {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("email_templates")
    .select("subject_template, body_template")
    .eq("template_type", "profile_access")
    .eq("active", true)
    .is("project_id", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { subject: data?.subject_template || DEFAULT_SUBJECT, body: data?.body_template || DEFAULT_BODY };
}

export async function sendBrandedProfileAccessLink(personId: string, actorUserId: string | null) {
  const admin = createSupabaseAdminClient();
  const { data: person, error: personError } = await admin.from("people")
    .select("id, full_name, preferred_name, email")
    .eq("id", personId)
    .maybeSingle();
  if (personError || !person) throw new Error(personError?.message ?? "Person not found.");
  const email = String(person.email ?? "").trim().toLowerCase();
  if (!email) throw new Error("Add an email address before sending profile access.");

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashProfileAccessToken(token);
  const expiresAt = new Date(Date.now() + LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: access, error: accessError } = await admin.from("profile_access_links").insert({
    person_id: person.id, email, token_hash: tokenHash, expires_at: expiresAt, created_by: actorUserId
  }).select("id").single();
  if (accessError) throw new Error(accessError.message);

  const accessUrl = `${SITE_URL.replace(/\/+$/, "")}/profile-access/${token}`;
  const variables = {
    person_name: String(person.preferred_name || person.full_name),
    profile_access_url: accessUrl,
    expires_in: `${LINK_LIFETIME_DAYS} days`
  };
  const template = await activeTemplate();
  try {
    const delivery = await sendHtmlEmail({
      to: email,
      subject: renderTemplate(template.subject, variables),
      html: renderTemplate(template.body, variables, true)
    });
    return { email, accessId: String(access.id), providerId: delivery.id };
  } catch (error) {
    await admin.from("profile_access_links").delete().eq("id", access.id);
    throw error;
  }
}

export async function sendProfileAccessForEmail(email: string) {
  const admin = createSupabaseAdminClient();
  const normalized = email.trim().toLowerCase();
  const { data: person } = await admin.from("people").select("id").ilike("email", normalized).maybeSingle();
  if (!person) return false;
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: recent } = await admin.from("profile_access_links").select("id").eq("person_id", person.id).gte("created_at", cutoff).limit(1);
  if (recent?.length) return true;
  await sendBrandedProfileAccessLink(String(person.id), null);
  return true;
}

export async function getProfileAccessLink(token: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("profile_access_links")
    .select("id, person_id, email, expires_at, used_at, people(full_name, preferred_name)")
    .eq("token_hash", hashProfileAccessToken(token))
    .maybeSingle();
  if (!data || data.used_at || new Date(String(data.expires_at)).getTime() <= Date.now()) return null;
  return data;
}

export async function consumeProfileAccessLink(token: string) {
  const admin = createSupabaseAdminClient();
  const access = await getProfileAccessLink(token);
  if (!access) throw new Error("This profile access link has expired or has already been used.");

  let generated: { hashedToken: string; type: "magiclink" | "invite" } | null = null;
  for (const type of ["magiclink", "invite"] as const) {
    const { data, error } = await admin.auth.admin.generateLink({ type, email: String(access.email) });
    const hashedToken = String(data?.properties?.hashed_token ?? "").trim();
    if (!error && hashedToken) { generated = { hashedToken, type }; break; }
  }
  if (!generated) throw new Error("A secure profile session could not be created.");

  const { data: claimed, error: claimError } = await admin.from("profile_access_links")
    .update({ used_at: new Date().toISOString() })
    .eq("id", access.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (claimError || !claimed) throw new Error("This profile access link has already been used.");

  const callback = new URL(`${SITE_URL.replace(/\/+$/, "")}/auth/callback`);
  callback.searchParams.set("next", "/my-profile");
  callback.searchParams.set("token_hash", generated.hashedToken);
  callback.searchParams.set("type", generated.type);
  return callback.toString();
}

export const defaultProfileAccessTemplate = { subject: DEFAULT_SUBJECT, body: DEFAULT_BODY };
