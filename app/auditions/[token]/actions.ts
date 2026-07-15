"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { applyProfileEnrichment, getVerifiedProfile } from "@/lib/profile-intake";

const uuid = z.string().uuid();

export async function submitAuditionAction(formData: FormData) {
  const token = uuid.parse(formData.get("formToken"));
  const fields = JSON.parse(String(formData.get("fieldDefinitions") ?? "[]")) as Array<{ field_key: string; field_type: string; required: boolean;settings?:{booking_category?:string;same_day_as?:string};conditional_logic?:{field_key?:string;value?:string} }>;
  const answers: Record<string, string | string[]> = {};
  const bookings:Record<string,string>={};
  const uploads: Array<{ key: string; file: File }> = [];
  for (const field of fields) {
    if (field.field_type === "file") {
      const file = formData.get(field.field_key);
      if (file instanceof File && file.size > 0) uploads.push({ key: field.field_key, file });
      continue;
    }
    const values = formData.getAll(field.field_key).map(String).filter(Boolean);
    if(field.field_type==="slot_selector"){const selected=values[0]??"";if(selected){bookings[field.field_key]=uuid.parse(selected);answers[field.field_key]=selected;}continue;}
    const value = field.field_type === "multiple_choice" || field.field_type === "role_selector" ? values : (values[0] ?? "");
    answers[field.field_key] = value;
  }
  const applies=(field:typeof fields[number])=>{const condition=field.conditional_logic;if(!condition?.field_key||!condition.value)return true;const source=answers[condition.field_key];return Array.isArray(source)?source.includes(condition.value):source===condition.value;};
  for(const field of fields){if(!field.required||!applies(field))continue;const value=field.field_type==="file"?uploads.find((upload)=>upload.key===field.field_key):field.field_type==="slot_selector"?bookings[field.field_key]:answers[field.field_key];if(!value||(Array.isArray(value)&&!value.length))redirect(`/auditions/${token}?error=${encodeURIComponent("Please complete all required questions and audition bookings.")}`);}
  const admin = createSupabaseAdminClient();
  const { data: form, error: formError } = await admin.from("audition_forms").select("id, project_id").eq("public_token", token).maybeSingle();
  if(formError){console.error("Audition form verification failed",{token,error:formError.message});redirect(`/auditions/${token}?error=${encodeURIComponent("We could not verify this audition form. No submission was created. Please contact production staff.")}`);}
  if (!form) redirect(`/auditions/${token}?error=${encodeURIComponent("Audition form is unavailable.")}`);
  const submittedEmail = String(answers.email ?? "").trim().toLowerCase();
  const { data: existingBefore } = submittedEmail ? await admin.from("people").select("id").ilike("email", submittedEmail).limit(1).maybeSingle() : { data: null };
  const verified = await getVerifiedProfile(String(formData.get("profileSession") ?? ""), "audition", String(form.id));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_public_audition_v2", { form_token: token, answer_payload: answers, booking_payload:bookings });
  if (error || !data) redirect(`/auditions/${token}?error=${encodeURIComponent(error?.message ?? "Could not submit audition form.")}`);
  const result = data as { submission_id: string; access_token: string };
  const { data: submission } = await admin.from("audition_submissions").select("person_id").eq("id", result.submission_id).maybeSingle();
  let personId = String(submission?.person_id ?? "");
  if (verified && personId && verified.id !== personId) {
    personId = verified.id;
    await admin.from("audition_submissions").update({ person_id: verified.id, duplicate_status: "resolved", duplicate_candidates: [] }).eq("id", result.submission_id);
  }
  if (personId && (verified || !existingBefore)) {
    const roleIds = Array.isArray(answers.role_interests) ? answers.role_interests.map(String) : [];
    const { data: interestRoles } = roleIds.length ? await admin.from("project_roles").select("name").in("id", roleIds) : { data: [] };
    await applyProfileEnrichment({ personId, sourceType: "audition", sourceId: result.submission_id, values: {
      full_name: String(answers.full_name ?? ""), preferred_name: String(answers.preferred_name ?? ""), email: submittedEmail,
      phone: String(answers.phone ?? ""), pronouns: String(answers.pronouns ?? ""), affiliation: answers.graduation_year ? `Siena ${String(answers.graduation_year)}` : "",
      performance_interests: (interestRoles ?? []).map((row) => String(row.name)), technical_interests: Array.isArray(answers.production_interests) ? answers.production_interests.map(String) : [],
      vocal_range: String(answers.vocal_range ?? ""), instruments: String(answers.instruments ?? ""), special_skills: String(answers.special_skills ?? ""),
      performance_experience: String(answers.performance_experience ?? ""), dance_styles: Array.isArray(answers.dance_styles) ? answers.dance_styles.map(String) : [], dance_experience: String(answers.dance_movement ?? "")
    }});
  }
  for (const upload of uploads) {
    if (upload.file.size > 5 * 1024 * 1024) redirect(`/auditions/${token}/confirmation?access=${result.access_token}&warning=${encodeURIComponent(`${upload.file.name} exceeded 5 MB and was not uploaded.`)}`);
    const bytes = Buffer.from(await upload.file.arrayBuffer());
    const { error: uploadError } = await supabase.rpc("upload_public_audition_file", {
      access_token: result.access_token,
      target_field_key: upload.key,
      upload_name: upload.file.name,
      upload_type: upload.file.type || "application/octet-stream",
      upload_data: `\\x${bytes.toString("hex")}`
    });
    if (uploadError) redirect(`/auditions/${token}/confirmation?access=${result.access_token}&warning=${encodeURIComponent(uploadError.message)}`);
  }
  redirect(`/auditions/${token}/confirmation?access=${result.access_token}`);
}

export async function manageAuditionBookingAction(formData: FormData) {
  const token = uuid.parse(formData.get("formToken"));
  const access = uuid.parse(formData.get("accessToken"));
  const action = z.enum(["cancel", "reschedule"]).parse(formData.get("requestedAction"));
  const slotRaw = String(formData.get("slotId") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("manage_public_audition_submission", { access_token: access, requested_action: action, selected_slot_id: slotRaw ? uuid.parse(slotRaw) : null });
  if (error) redirect(`/auditions/${token}/confirmation?access=${access}&error=${encodeURIComponent(error.message)}`);
  redirect(`/auditions/${token}/confirmation?access=${access}&success=${encodeURIComponent(action === "cancel" ? "Audition registration cancelled." : "Audition time updated.")}`);
}
