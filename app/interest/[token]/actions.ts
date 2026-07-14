"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { applyProfileEnrichment, getVerifiedProfile } from "@/lib/profile-intake";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const uuid = z.string().uuid();
const values = z.object({
  fullName: z.string().trim().min(1).max(180), preferredName: z.string().trim().max(120), email: z.string().trim().email(), vendorNumber: z.string().trim().max(40), phone: z.string().trim().max(40), pronouns: z.string().trim().max(80), affiliation: z.string().trim().max(160),
  technicalInterests: z.array(z.string().trim().max(120)).max(50), otherTechnicalInterest: z.string().trim().max(500), vocalRange: z.string().trim().max(120), otherVocalRange: z.string().trim().max(200),
  instruments: z.string().trim().max(4000), specialSkills: z.string().trim().max(4000), performanceExperience: z.string().trim().max(8000), technicalExperience: z.string().trim().max(8000), certificationsTraining: z.string().trim().max(4000),
  danceStyles: z.array(z.string().trim().max(120)).max(50), otherDanceStyle: z.string().trim().max(500), danceExperience: z.string().trim().max(4000)
});

export async function submitTechnicalInterestAction(formData: FormData) {
  const token = uuid.parse(formData.get("formToken"));
  const formId = uuid.parse(formData.get("formId"));
  const parsed = values.safeParse({
    fullName: formData.get("fullName"), preferredName: formData.get("preferredName"), email: formData.get("email"), vendorNumber: formData.get("vendorNumber"), phone: formData.get("phone"), pronouns: formData.get("pronouns"), affiliation: formData.get("affiliation"),
    technicalInterests: formData.getAll("technicalInterests"), otherTechnicalInterest: formData.get("otherTechnicalInterest"), vocalRange: formData.get("vocalRange"), otherVocalRange: formData.get("otherVocalRange"), instruments: formData.get("instruments"), specialSkills: formData.get("specialSkills"), performanceExperience: formData.get("performanceExperience"), technicalExperience: formData.get("technicalExperience"), certificationsTraining: formData.get("certificationsTraining"), danceStyles: formData.getAll("danceStyles"), otherDanceStyle: formData.get("otherDanceStyle"), danceExperience: formData.get("danceExperience")
  });
  if (!parsed.success) redirect(`/interest/${token}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Please review the form.")}`);
  const input = parsed.data; const admin = createSupabaseAdminClient();
  const { data: form } = await admin.from("technical_interest_forms").select("id").eq("id", formId).eq("public_token", token).eq("status", "published").maybeSingle();
  if (!form) redirect(`/interest/${token}?error=${encodeURIComponent("This form is unavailable.")}`);
  const profileToken = String(formData.get("profileSession") ?? "");
  const verified = await getVerifiedProfile(profileToken, "technical_interest", formId);
  let personId = verified?.id ?? "";
  if (!personId) {
    let existingQuery = admin.from("people").select("id").ilike("email", input.email).limit(1);
    if (input.vendorNumber) existingQuery = existingQuery.eq("vendor_number", input.vendorNumber);
    const { data: existing } = await existingQuery.maybeSingle();
    if (existing) redirect(`/interest/${token}?error=${encodeURIComponent("A profile already uses these details. Use Load my saved profile and enter the emailed verification code before updating it.")}`);
    const { data: created, error } = await admin.from("people").insert({ full_name: input.fullName, preferred_name: input.preferredName, email: input.email.toLowerCase(), vendor_number: input.vendorNumber, phone: input.phone, pronouns: input.pronouns, affiliation: input.affiliation, person_type: "student" }).select("id").single();
    if (error || !created) redirect(`/interest/${token}?error=${encodeURIComponent(error?.message ?? "Profile could not be created.")}`);
    personId = String(created.id);
  }
  const technicalInterests = [...input.technicalInterests, ...(input.otherTechnicalInterest ? [`Other: ${input.otherTechnicalInterest}`] : [])];
  const danceStyles = [...input.danceStyles, ...(input.otherDanceStyle ? [`Other: ${input.otherDanceStyle}`] : [])];
  const enrichment = { full_name: input.fullName, preferred_name: input.preferredName, email: input.email, vendor_number: input.vendorNumber, phone: input.phone, pronouns: input.pronouns, affiliation: input.affiliation, technical_interests: technicalInterests, vocal_range: input.otherVocalRange || input.vocalRange, instruments: input.instruments, special_skills: input.specialSkills, performance_experience: input.performanceExperience, technical_experience: input.technicalExperience, certifications_training: input.certificationsTraining, dance_styles: danceStyles, dance_experience: input.danceExperience };
  await applyProfileEnrichment({ personId, sourceType: "technical_interest", values: enrichment });
  const { error: submissionError } = await admin.from("technical_interest_submissions").insert({ form_id: formId, person_id: personId, answers: enrichment, profile_snapshot: enrichment });
  if (submissionError) redirect(`/interest/${token}?error=${encodeURIComponent(submissionError.message)}`);
  redirect(`/interest/${token}?submitted=true`);
}
