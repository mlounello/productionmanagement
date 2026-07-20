"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { applyProfileEnrichment, getVerifiedProfile } from "@/lib/profile-intake";
import { syncAuditionCalendarSlots, syncAuditionSubmissionCalendar } from "@/lib/audition-calendar-sync";

const uuid = z.string().uuid();

export type AuditionSubmissionResult =
  | { ok: true; accessToken: string; warning?: string }
  | { ok: false; error: string };

export async function submitAuditionAction(formData: FormData): Promise<AuditionSubmissionResult> {
  const parsedToken = uuid.safeParse(formData.get("formToken"));
  if (!parsedToken.success) return { ok: false, error: "This audition form link is invalid." };
  const token = parsedToken.data;
  let fields: Array<{ field_key: string; field_type: string; required: boolean;settings?:{booking_category?:string;same_day_as?:string;dependency_filter?:"same_day"|"mapped_sessions";session_map?:Record<string,string[]>};conditional_logic?:{field_key?:string;value?:string} }> = [];
  let pendingUploadKeys = new Set<string>();
  try {
    fields = JSON.parse(String(formData.get("fieldDefinitions") ?? "[]"));
    pendingUploadKeys = new Set((JSON.parse(String(formData.get("pendingUploadKeys") ?? "[]")) as unknown[]).map(String));
  } catch {
    return { ok: false, error: "The audition form could not be read. Please refresh the page and try again." };
  }
  const answers: Record<string, string | string[]> = {};
  const bookings:Record<string,string>={};
  for (const field of fields) {
    if (field.field_type === "file") continue;
    const values = formData.getAll(field.field_key).map(String).filter(Boolean);
    if(field.field_type==="slot_selector"){const selected=values[0]??"";if(selected){const parsed=uuid.safeParse(selected);if(!parsed.success)return {ok:false,error:"One of the selected audition times is invalid. Please refresh and choose it again."};bookings[field.field_key]=parsed.data;answers[field.field_key]=selected;}continue;}
    const value = field.field_type === "multiple_choice" || field.field_type === "role_selector" ? values : (values[0] ?? "");
    answers[field.field_key] = value;
  }
  const applies=(field:typeof fields[number])=>{const condition=field.conditional_logic;if(!condition?.field_key||!condition.value)return true;const source=answers[condition.field_key];return Array.isArray(source)?source.includes(condition.value):source===condition.value;};
  for(const field of fields){const dependency=field.settings?.same_day_as;if(field.field_type==="slot_selector"&&bookings[field.field_key]&&dependency&&!bookings[dependency])return {ok:false,error:"Choose the linked audition block before selecting the dependent audition time."};}
  for(const field of fields){if(!field.required||!applies(field))continue;const value=field.field_type==="file"?pendingUploadKeys.has(field.field_key):field.field_type==="slot_selector"?bookings[field.field_key]:answers[field.field_key];if(!value||(Array.isArray(value)&&!value.length))return {ok:false,error:"Please complete all required questions and audition bookings."};}
  const admin = createSupabaseAdminClient();
  const { data: form, error: formError } = await admin.from("audition_forms").select("id, project_id").eq("public_token", token).maybeSingle();
  if(formError){console.error("Audition form verification failed",{token,error:formError.message});return {ok:false,error:"We could not verify this audition form. No submission was created. Please contact production staff."};}
  if (!form) return {ok:false,error:"Audition form is unavailable."};
  const submittedEmail = String(answers.email ?? "").trim().toLowerCase();
  const { data: existingBefore } = submittedEmail ? await admin.from("people").select("id").ilike("email", submittedEmail).limit(1).maybeSingle() : { data: null };
  const verified = await getVerifiedProfile(String(formData.get("profileSession") ?? ""), "audition", String(form.id));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_public_audition_v2", { form_token: token, answer_payload: answers, booking_payload:bookings });
  if (error || !data) return {ok:false,error:error?.message ?? "Could not submit audition form."};
  const result = data as { submission_id: string; access_token: string };
  const { data: submission } = await admin.from("audition_submissions").select("person_id").eq("id", result.submission_id).maybeSingle();
  let personId = String(submission?.person_id ?? "");
  if (verified && personId && verified.id !== personId) {
    personId = verified.id;
    await admin.from("audition_submissions").update({ person_id: verified.id, duplicate_status: "resolved", duplicate_candidates: [] }).eq("id", result.submission_id);
  }
  if (personId && (verified || !existingBefore)) {
    try {
      const roleIds = Array.isArray(answers.role_interests) ? answers.role_interests.map(String) : [];
      const { data: interestRoles } = roleIds.length ? await admin.from("project_roles").select("name").in("id", roleIds) : { data: [] };
      await applyProfileEnrichment({ personId, sourceType: "audition", sourceId: result.submission_id, values: {
        full_name: String(answers.full_name ?? ""), preferred_name: String(answers.preferred_name ?? ""), email: submittedEmail,
        phone: String(answers.phone ?? ""), pronouns: String(answers.pronouns ?? ""), affiliation: answers.graduation_year ? `Siena ${String(answers.graduation_year)}` : "",
        performance_interests: (interestRoles ?? []).map((row) => String(row.name)), technical_interests: Array.isArray(answers.production_interests) ? answers.production_interests.map(String) : [],
        vocal_range: String(answers.vocal_range ?? ""), instruments: String(answers.instruments ?? ""), special_skills: String(answers.special_skills ?? ""),
        performance_experience: String(answers.performance_experience ?? ""), dance_styles: Array.isArray(answers.dance_styles) ? answers.dance_styles.map(String) : [], dance_experience: String(answers.dance_movement ?? "")
      }});
    } catch (profileError) {
      console.error("Audition profile enrichment failed", { submissionId: result.submission_id, error: profileError instanceof Error ? profileError.message : "Unknown error" });
    }
  }
  let calendarWarning="";
  try{const calendar=await syncAuditionSubmissionCalendar(result.submission_id);calendarWarning=calendar.warnings.join(" ");}catch(error){calendarWarning=error instanceof Error?error.message:"Google Calendar invitations could not be created.";}
  return {ok:true,accessToken:result.access_token,...(calendarWarning?{warning:"Your audition was saved, but the calendar invitation could not be sent yet. Production staff can retry it for you."}:{})};
}

export async function manageAuditionBookingAction(formData: FormData) {
  const token = uuid.parse(formData.get("formToken"));
  const access = uuid.parse(formData.get("accessToken"));
  const action = z.enum(["cancel", "reschedule"]).parse(formData.get("requestedAction"));
  const slotRaw = String(formData.get("slotId") ?? "");
  const supabase = await createSupabaseServerClient();
  const admin=createSupabaseAdminClient();
  const {data:before}=await admin.from("audition_submissions").select("id,project_id,audition_submission_slots(slot_id)").eq("applicant_token",access).maybeSingle();
  const oldSlotIds=((before?.audition_submission_slots??[]) as Array<{slot_id:string}>).map((row)=>row.slot_id);
  const { error } = await supabase.rpc("manage_public_audition_submission", { access_token: access, requested_action: action, selected_slot_id: slotRaw ? uuid.parse(slotRaw) : null });
  if (error) redirect(`/auditions/${token}/confirmation?access=${access}&error=${encodeURIComponent(error.message)}`);
  let warning="";
  if(before){const {data:after}=await admin.from("audition_submissions").select("audition_submission_slots(slot_id)").eq("id",before.id).maybeSingle();const newSlotIds=((after?.audition_submission_slots??[]) as Array<{slot_id:string}>).map((row)=>row.slot_id);try{const result=await syncAuditionCalendarSlots(String(before.project_id),[...oldSlotIds,...newSlotIds]);warning=result.warnings.join(" ");await admin.from("audition_submissions").update({google_calendar_sync_status:result.status,google_calendar_sync_error:warning,google_calendar_synced_at:new Date().toISOString()}).eq("id",before.id);}catch(syncError){warning=syncError instanceof Error?syncError.message:"Calendar update failed.";}}
  const params=new URLSearchParams({access,success:action === "cancel" ? "Audition registration cancelled." : "Audition time updated."});if(warning)params.set("warning","Your booking was updated, but the calendar invitation could not be updated yet. Production staff can retry it for you.");redirect(`/auditions/${token}/confirmation?${params}`);
}
