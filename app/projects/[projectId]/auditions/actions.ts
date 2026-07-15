"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { optionalMusicFields, standardAuditionFields, standardAuditionSections } from "@/lib/auditions";
import { beginAssignmentOnboarding } from "@/lib/role-acceptance";
import { syncAssignmentToPlaybill } from "@/lib/playbill-sync";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const uuid = z.string().uuid();
const fieldSchema = z.object({
  id: z.string().uuid().optional(),
  section_key: z.string().trim().min(1).max(80),
  field_key: z.string().trim().min(1).max(100).regex(/^[a-z0-9_]+$/),
  label: z.string().trim().min(1).max(500),
  field_type: z.enum(["short_text", "long_text", "email", "phone", "single_choice", "multiple_choice", "yes_no", "acknowledgement", "file", "role_selector", "slot_selector"]),
  required: z.boolean(),
  options: z.array(z.string().trim().max(300)).max(100),
  help_text: z.string().trim().max(2000),
  placeholder: z.string().trim().max(300),
  sensitivity: z.enum(["standard", "sensitive"]),
  profile_field: z.string().trim().max(80),
  export_group: z.string().trim().min(1).max(80),
  sort_order: z.number().int()
});
const sectionSchema = z.object({
  id: z.string().uuid().optional(),
  section_key: z.string().trim().min(1).max(80).regex(/^[a-z0-9_]+$/),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000),
  section_type: z.string().trim().min(1).max(80),
  sort_order: z.number().int()
});

function path(projectId: string, message?: string, error?: boolean) {
  const base = `/projects/${projectId}/auditions`;
  if (!message) return base;
  return `${base}?${error ? "error" : "success"}=${encodeURIComponent(message)}`;
}

async function context(projectId: string) {
  const user = await requireUser();
  const parsed = uuid.parse(projectId);
  const supabase = await createSupabaseServerClient();
  const { data: allowed } = await supabase.rpc("can_manage_auditions", { target_project_id: parsed });
  if (!allowed) throw new Error("You do not have permission to manage auditions for this project.");
  return { projectId: parsed, supabase, user };
}

async function reviewContext(projectId: string) {
  const user = await requireUser();
  const parsed = uuid.parse(projectId);
  const supabase = await createSupabaseServerClient();
  const { data: allowed } = await supabase.rpc("can_review_auditions", { target_project_id: parsed });
  if (!allowed) throw new Error("You do not have permission to review auditions for this project.");
  return { projectId: parsed, supabase, user };
}

async function projectManagerContext(projectId:string){
  const user=await requireUser();
  const parsed=uuid.parse(projectId);
  const supabase=await createSupabaseServerClient();
  const [{data:projectAllowed},{data:appAllowed}]=await Promise.all([
    supabase.rpc("has_project_role",{target_project_id:parsed,allowed_roles:["project_manager","producer"]}),
    supabase.rpc("has_app_role",{allowed_roles:["admin","producer"]})
  ]);
  if(!projectAllowed&&!appAllowed)throw new Error("Only a project manager or producer can add project staff.");
  return {projectId:parsed,supabase,user};
}

export async function createAuditionFormAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId"));
  const { supabase } = await context(projectId);
  const title = z.string().trim().min(1).max(200).parse(formData.get("title"));
  const includeMusic = formData.get("includeMusic") === "on";
  const { data: form, error } = await supabase.from("audition_forms").insert({
    project_id: projectId,
    title,
    description: "Complete each section as thoroughly as you are able. New and returning performers are welcome.",
    settings: { packet_rubric: ["Preparation", "Character / Acting", "Collaboration", "Overall recommendation"] }
  }).select("id").single();
  if (error || !form) redirect(path(projectId, error?.message ?? "Could not create form.", true));
  const { error: sectionError } = await supabase.from("audition_form_sections").insert(
    standardAuditionSections.map((section) => ({ ...section, form_id: form.id }))
  );
  if (sectionError) redirect(path(projectId, sectionError.message, true));
  const fields = includeMusic ? [...standardAuditionFields, ...optionalMusicFields] : standardAuditionFields;
  const { error: fieldError } = await supabase.from("audition_form_fields").insert(
    fields.map((field) => ({ ...field, form_id: form.id }))
  );
  if (fieldError) redirect(path(projectId, fieldError.message, true));
  redirect(path(projectId, "Audition form created from the editable Siena template."));
}

export async function deleteAuditionFormAction(formData:FormData){
  const projectId=uuid.parse(formData.get("projectId"));
  const formId=uuid.parse(formData.get("formId"));
  const {supabase}=await context(projectId);
  const [{data:form,error:formError},{count,error:countError}]=await Promise.all([
    supabase.from("audition_forms").select("id,status,title").eq("id",formId).eq("project_id",projectId).maybeSingle(),
    supabase.from("audition_submissions").select("id",{count:"exact",head:true}).eq("form_id",formId)
  ]);
  if(formError||!form)redirect(path(projectId,formError?.message??"Audition form not found.",true));
  if(countError)redirect(path(projectId,countError.message,true));
  if(form.status==="published")redirect(path(projectId,"Archive this published form instead of deleting it.",true));
  if((count??0)>0)redirect(path(projectId,"This form has submissions and cannot be deleted. Archive it to preserve applicant records.",true));
  const {error}=await supabase.from("audition_forms").delete().eq("id",formId).eq("project_id",projectId);
  if(error)redirect(path(projectId,error.message,true));
  redirect(path(projectId,`${form.title} was deleted.`));
}

export async function saveAuditionFormBuilderAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId"));
  const formId = uuid.parse(formData.get("formId"));
  const { supabase } = await context(projectId);
  const sections = z.array(sectionSchema).parse(JSON.parse(String(formData.get("sectionsJson") ?? "[]")));
  const fields = z.array(fieldSchema).parse(JSON.parse(String(formData.get("fieldsJson") ?? "[]")));
  if (!sections.length) redirect(path(projectId, "At least one form section is required.", true));
  const { data: current } = await supabase.from("audition_forms").select("status, version").eq("id", formId).eq("project_id", projectId).single();
  if (!current) redirect(path(projectId, "Audition form not found.", true));
  if (current.status === "published") redirect(path(projectId, "Create a new version before changing a published form.", true));
  await supabase.from("audition_form_fields").delete().eq("form_id", formId);
  await supabase.from("audition_form_sections").delete().eq("form_id", formId);
  const { error: sectionError } = await supabase.from("audition_form_sections").insert(sections.map(({ id: _id, ...section }) => ({ ...section, form_id: formId })));
  if (sectionError) redirect(path(projectId, sectionError.message, true));
  const { error: fieldError } = await supabase.from("audition_form_fields").insert(fields.map(({ id: _id, ...field }) => ({ ...field, form_id: formId })));
  if (fieldError) redirect(path(projectId, fieldError.message, true));
  revalidatePath(path(projectId));
  redirect(path(projectId, "Form sections and questions saved."));
}

export async function updateAuditionFormAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId"));
  const formId = uuid.parse(formData.get("formId"));
  const { supabase } = await context(projectId);
  const status = z.enum(["draft", "published", "archived"]).parse(formData.get("status"));
  const title = z.string().trim().min(1).max(200).parse(formData.get("title"));
  const description = z.string().trim().max(5000).parse(formData.get("description"));
  const closesAt = String(formData.get("closesAt") ?? "").trim();
  const { error } = await supabase.from("audition_forms").update({
    title,
    description,
    status,
    published_at: status === "published" ? new Date().toISOString() : null,
    closes_at: closesAt ? new Date(closesAt).toISOString() : null,
    allow_reschedule: formData.get("allowReschedule") === "on",
    allow_cancel: formData.get("allowCancel") === "on"
  }).eq("id", formId).eq("project_id", projectId);
  if (error) redirect(path(projectId, error.message, true));
  redirect(path(projectId, `Form saved as ${status}.`));
}

export async function saveAuditionRubricAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId"));
  const formId = uuid.parse(formData.get("formId"));
  const { supabase } = await context(projectId);
  const rubric = z.string().max(5000).parse(formData.get("rubric")).split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 30);
  const { data: form } = await supabase.from("audition_forms").select("settings").eq("id", formId).eq("project_id", projectId).single();
  const { error } = await supabase.from("audition_forms").update({ settings: { ...((form?.settings as Record<string, unknown>) ?? {}), packet_rubric: rubric } }).eq("id", formId).eq("project_id", projectId);
  if (error) redirect(path(projectId, error.message, true));
  redirect(path(projectId, "Custom review rubric saved."));
}

export async function duplicateAuditionFormVersionAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId"));
  const formId = uuid.parse(formData.get("formId"));
  const { supabase } = await context(projectId);
  const [{ data: form }, { data: sections }, { data: fields }] = await Promise.all([
    supabase.from("audition_forms").select("title, description, version, settings, allow_reschedule, allow_cancel").eq("id", formId).eq("project_id", projectId).single(),
    supabase.from("audition_form_sections").select("title, description, section_key, section_type, sort_order, settings").eq("form_id", formId),
    supabase.from("audition_form_fields").select("label, field_key, field_type, required, options, sort_order, section_key, help_text, placeholder, sensitivity, profile_field, conditional_logic, export_group, settings").eq("form_id", formId)
  ]);
  if (!form) redirect(path(projectId, "Form not found.", true));
  const { data: copy, error } = await supabase.from("audition_forms").insert({ ...form, project_id: projectId, title: `${form.title} v${Number(form.version) + 1}`, version: Number(form.version) + 1, status: "draft" }).select("id").single();
  if (error || !copy) redirect(path(projectId, error?.message ?? "Could not duplicate form.", true));
  if (sections?.length) await supabase.from("audition_form_sections").insert(sections.map((row) => ({ ...row, form_id: copy.id })));
  if (fields?.length) await supabase.from("audition_form_fields").insert(fields.map((row) => ({ ...row, form_id: copy.id })));
  redirect(path(projectId, "Editable draft version created."));
}

export async function createAuditionSessionAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId"));
  const { supabase } = await context(projectId);
  const title = z.string().trim().min(1).max(200).parse(formData.get("title"));
  const location = z.string().trim().max(200).parse(formData.get("location"));
  const startsAt = new Date(z.string().min(1).parse(formData.get("startsAt")));
  const endsAt = new Date(z.string().min(1).parse(formData.get("endsAt")));
  const interval = z.coerce.number().int().min(1).max(240).parse(formData.get("intervalMinutes"));
  const capacity = z.coerce.number().int().min(1).max(500).parse(formData.get("capacity"));
  const sessionType = z.enum(["appointments", "group_call", "workshop", "walk_in", "callback"]).parse(formData.get("sessionType"));
  const requestedBookingMode = z.enum(["self_book", "staff_assigned", "walk_in"]).parse(formData.get("bookingMode"));
  const bookingMode=sessionType==="callback"?"staff_assigned":requestedBookingMode;
  if (!(endsAt > startsAt)) redirect(path(projectId, "Session end must be after its start.", true));
  const { data: session, error } = await supabase.from("audition_sessions").insert({
    project_id: projectId, title, location, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
    interval_minutes: interval, slots_per_interval: capacity, capacity, session_type: sessionType, booking_mode: bookingMode,
    instructions: String(formData.get("instructions") ?? ""), is_published: formData.get("isPublished") === "on"
    ,booking_opens_at: sessionType!=="callback"&&String(formData.get("bookingOpensAt") ?? "") ? new Date(String(formData.get("bookingOpensAt"))).toISOString() : null
    ,booking_closes_at: sessionType!=="callback"&&String(formData.get("bookingClosesAt") ?? "") ? new Date(String(formData.get("bookingClosesAt"))).toISOString() : null
    ,reschedule_deadline: sessionType!=="callback"&&String(formData.get("rescheduleDeadline") ?? "") ? new Date(String(formData.get("rescheduleDeadline"))).toISOString() : null
    ,cancel_deadline: sessionType!=="callback"&&String(formData.get("cancelDeadline") ?? "") ? new Date(String(formData.get("cancelDeadline"))).toISOString() : null
  }).select("id").single();
  if (error || !session) redirect(path(projectId, error?.message ?? "Could not create session.", true));
  const rows: Array<Record<string, unknown>> = [];
  if (sessionType === "appointments") {
    for (let cursor = startsAt.getTime(); cursor < endsAt.getTime(); cursor += interval * 60_000) {
      const slotEnd = Math.min(cursor + interval * 60_000, endsAt.getTime());
      rows.push({ session_id: session.id, starts_at: new Date(cursor).toISOString(), ends_at: new Date(slotEnd).toISOString(), capacity, slot_type: capacity === 1 ? "individual" : "group", self_bookable: bookingMode === "self_book" });
    }
  } else {
    rows.push({ session_id: session.id, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), capacity, slot_type: sessionType, self_bookable: bookingMode === "self_book" });
  }
  const { error: slotsError } = await supabase.from("audition_slots").insert(rows);
  if (slotsError) redirect(path(projectId, slotsError.message, true));
  redirect(path(projectId, `${rows.length} audition slot${rows.length === 1 ? "" : "s"} created.`));
}

export async function updateAuditionSubmissionAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId"));
  const submissionId = uuid.parse(formData.get("submissionId"));
  const { supabase } = await context(projectId);
  const { error } = await supabase.from("audition_submissions").update({
    audition_status: z.enum(["registered", "checked_in", "auditioned", "no_show", "cancelled"]).parse(formData.get("auditionStatus")),
    callback_status: z.enum(["not_reviewed", "recommended", "invited", "declined", "not_called"]).parse(formData.get("callbackStatus")),
    casting_status: z.enum(["not_reviewed", "considering", "cast", "not_cast", "withdrawn"]).parse(formData.get("castingStatus")),
    private_notes: z.string().trim().max(10000).parse(formData.get("privateNotes")),
    scheduled_starts_at: String(formData.get("scheduledStartsAt") ?? "") ? new Date(String(formData.get("scheduledStartsAt"))).toISOString() : null,
    scheduled_ends_at: String(formData.get("scheduledEndsAt") ?? "") ? new Date(String(formData.get("scheduledEndsAt"))).toISOString() : null,
    schedule_notes: z.string().trim().max(2000).parse(formData.get("scheduleNotes")),
    checked_in_at: formData.get("auditionStatus") === "checked_in" ? new Date().toISOString() : null
  }).eq("id", submissionId).eq("project_id", projectId);
  if (error) redirect(path(projectId, error.message, true));
  redirect(path(projectId, "Applicant review updated."));
}

export async function saveAuditionReviewAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId"));
  const submissionId = uuid.parse(formData.get("submissionId"));
  const { supabase, user } = await reviewContext(projectId);
  const rubricLabels = z.array(z.string().max(200)).parse(JSON.parse(String(formData.get("rubricLabels") ?? "[]")));
  const rubric: Record<string, number> = {};
  rubricLabels.forEach((label, index) => { const raw = Number(formData.get(`rubric_${index}`)); if (Number.isFinite(raw) && raw >= 1 && raw <= 5) rubric[label] = raw; });
  const { error } = await supabase.from("audition_reviews").upsert({
    submission_id: submissionId, reviewer_user_id: user.id, rubric,
    notes: z.string().trim().max(10000).parse(formData.get("reviewNotes")),
    recommendation: z.enum(["", "callback", "consider", "cast", "not_cast", "discuss"]).parse(formData.get("recommendation"))
  }, { onConflict: "submission_id,reviewer_user_id" });
  if (error) redirect(path(projectId, error.message, true));
  redirect(path(projectId, "Your independent audition review was saved."));
}

export async function resolveAuditionDuplicateAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId"));
  const submissionId = uuid.parse(formData.get("submissionId"));
  const personId = uuid.parse(formData.get("personId"));
  const { supabase } = await context(projectId);
  const { error } = await supabase.from("audition_submissions").update({ person_id: personId, duplicate_status: "resolved" }).eq("id", submissionId).eq("project_id", projectId);
  if (error) redirect(path(projectId, error.message, true));
  redirect(path(projectId, "Submission linked to the selected durable person."));
}

export async function confirmAuditionPersonAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId"));
  const submissionId = uuid.parse(formData.get("submissionId"));
  const { supabase } = await context(projectId);
  const { error } = await supabase.from("audition_submissions").update({ duplicate_status: "confirmed_separate" }).eq("id", submissionId).eq("project_id", projectId);
  if (error) redirect(path(projectId, error.message, true));
  redirect(path(projectId, "New person confirmed as separate."));
}

export async function castAuditionSubmissionAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId"));
  const submissionId = uuid.parse(formData.get("submissionId"));
  const roleId = uuid.parse(formData.get("roleId"));
  const { supabase, user } = await context(projectId);
  const { data: submission } = await supabase.from("audition_submissions").select("person_id").eq("id", submissionId).eq("project_id", projectId).single();
  if (!submission) redirect(path(projectId, "Submission not found.", true));
  const { data: assignment, error } = await supabase.from("role_assignments").upsert({ project_id: projectId, role_id: roleId, person_id: submission.person_id, status: "draft", assignment_kind: String(formData.get("assignmentKind") ?? "primary") }, { onConflict: "role_id,person_id" }).select("id").single();
  if (error) redirect(path(projectId, error.message, true));
  let googleWarning = "";
  let deferPlaybill = false;
  try {
    const result = await beginAssignmentOnboarding(projectId, String(assignment.id), user.id);
    googleWarning = result.warnings.join(" ");
    deferPlaybill = result.deferPlaybill;
  } catch (automationError) {
    googleWarning = automationError instanceof Error ? automationError.message : "Google Group automation could not run.";
  }
  if(!deferPlaybill){try{await syncAssignmentToPlaybill(projectId,String(assignment.id));}catch(syncError){googleWarning=[googleWarning,`Playbill: ${syncError instanceof Error?syncError.message:"sync failed"}`].filter(Boolean).join(" ");}}
  await supabase.from("audition_submissions").update({ casting_status: "cast" }).eq("id", submissionId);
  redirect(path(projectId, googleWarning ? `Applicant selected and linked to the project role. Onboarding needs attention: ${googleWarning}` : deferPlaybill ? "Applicant selected. Their role acceptance was sent; Playbill and production onboarding will begin after acceptance." : "Applicant selected and linked to the project role."));
}

export async function setAuditionReviewerAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId"));
  const userId = uuid.parse(formData.get("userId"));
  const reviewerRole = z.enum(["director", "production_manager", "intimacy_staff"]).parse(formData.get("reviewerRole"));
  const { supabase } = await context(projectId);
  const { data: membership } = await supabase.from("project_memberships").select("id").eq("project_id", projectId).eq("user_id", userId).eq("active", true).limit(1).maybeSingle();
  if (!membership) redirect(path(projectId, "Reviewer must first be an active project member.", true));
  const { error } = await supabase.from("audition_reviewer_permissions").upsert({ project_id: projectId, user_id: userId, reviewer_role: reviewerRole, active: true }, { onConflict: "project_id,user_id,reviewer_role" });
  if (error) redirect(path(projectId, error.message, true));
  redirect(path(projectId, "Audition reviewer access granted."));
}

export async function addAuditionProjectStaffAction(formData:FormData){
  const projectId=uuid.parse(formData.get("projectId"));
  const personId=uuid.parse(formData.get("personId"));
  const reviewerRole=z.enum(["director","production_manager","intimacy_staff"]).parse(formData.get("reviewerRole"));
  const {supabase}=await projectManagerContext(projectId);
  const {data:person,error:personError}=await supabase.from("people").select("id,auth_user_id,full_name").eq("id",personId).maybeSingle();
  if(personError||!person)redirect(path(projectId,personError?.message??"Staff profile not found.",true));
  if(!person.auth_user_id)redirect(path(projectId,"This person needs a connected Production Management login before audition access can be granted.",true));
  const projectRole=reviewerRole==="production_manager"?"project_manager":"staff";
  const {error:membershipError}=await supabase.from("project_memberships").upsert({project_id:projectId,user_id:person.auth_user_id,person_id:person.id,role:projectRole,title:reviewerRole.replace(/_/g," "),active:true},{onConflict:"project_id,user_id,role"});
  if(membershipError)redirect(path(projectId,membershipError.message,true));
  const {error:permissionError}=await supabase.from("audition_reviewer_permissions").upsert({project_id:projectId,user_id:person.auth_user_id,reviewer_role:reviewerRole,active:true},{onConflict:"project_id,user_id,reviewer_role"});
  if(permissionError)redirect(path(projectId,permissionError.message,true));
  redirect(path(projectId,`${person.full_name} was added to the project and granted ${reviewerRole.replace(/_/g," ")} audition access.`));
}

export async function removeAuditionReviewerAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId"));
  const permissionId = uuid.parse(formData.get("permissionId"));
  const { supabase } = await context(projectId);
  const { error } = await supabase.from("audition_reviewer_permissions").delete().eq("id", permissionId).eq("project_id", projectId);
  if (error) redirect(path(projectId, error.message, true));
  redirect(path(projectId, "Audition reviewer access removed."));
}
