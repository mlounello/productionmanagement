"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { optionalMusicFields, standardAuditionFields, standardAuditionSections } from "@/lib/auditions";
import { beginAssignmentOnboarding } from "@/lib/role-acceptance";
import { syncAssignmentToPlaybill } from "@/lib/playbill-sync";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { sendAuditionAccessInvite } from "@/lib/audition-access-invites";
import { testGoogleCalendarAccess } from "@/lib/google-calendar-apps-script";
import { syncAuditionCalendarSlots } from "@/lib/audition-calendar-sync";

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
  sort_order: z.number().int(),
  conditional_logic:z.object({field_key:z.string().max(100).optional(),value:z.string().max(300).optional()}).optional().default({}),
  settings:z.object({booking_category:z.string().max(80).optional(),same_day_as:z.string().max(100).optional(),dependency_filter:z.enum(["same_day","mapped_sessions"]).optional(),session_map:z.record(z.string().uuid(),z.array(z.string().uuid()).max(50)).optional()}).optional().default({})
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

function schedulePath(projectId: string, message?: string, error?: boolean) {
  return `${path(projectId, message, error)}#schedule`;
}

function easternDate(value:string){const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);if(!match)return new Date(value);const base=Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]),Number(match[4]),Number(match[5]));const offset=(instant:number)=>{const name=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",timeZoneName:"longOffset"}).formatToParts(new Date(instant)).find((part)=>part.type==="timeZoneName")?.value??"GMT-00:00";const parsed=/GMT([+-])(\d{2}):(\d{2})/.exec(name);if(!parsed)return 0;const minutes=Number(parsed[2])*60+Number(parsed[3]);return parsed[1]==="-"?-minutes:minutes;};let result=base-offset(base)*60_000;result=base-offset(result)*60_000;return new Date(result);}

async function context(projectId: string) {
  const user = await requireUser();
  const parsed = uuid.parse(projectId);
  const supabase = await createSupabaseServerClient();
  const { data: allowed } = await supabase.rpc("can_manage_auditions", { target_project_id: parsed });
  if (!allowed) throw new Error("You do not have permission to manage auditions for this project.");
  return { projectId: parsed, supabase, user };
}

async function linkedSessionId(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, projectId: string, raw: FormDataEntryValue | null, sourceSessionId?: string) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const id = uuid.parse(value);
  if (sourceSessionId && id === sourceSessionId) redirect(schedulePath(projectId,"An audition block cannot automatically reserve itself.",true));
  const { data } = await supabase.from("audition_sessions").select("id, session_type, audition_slots(id)").eq("id", id).eq("project_id", projectId).maybeSingle();
  if (!data) redirect(schedulePath(projectId,"The linked audition block was not found in this project.",true));
  if (["appointments", "callback"].includes(data.session_type)) redirect(schedulePath(projectId,"The automatically reserved block must be a single group call, workshop, or walk-in block.",true));
  if ((data.audition_slots?.length ?? 0) !== 1) redirect(schedulePath(projectId,"The automatically reserved block must contain exactly one slot.",true));
  return id;
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

function calendarPath(projectId:string,message?:string,error?:boolean){return `${path(projectId,message,error)}#calendar-sync`;}

export async function saveAuditionCalendarSettingsAction(formData:FormData){
  const projectId=uuid.parse(formData.get("projectId"));const {supabase,user}=await context(projectId);
  const calendarId=z.string().trim().min(1).max(320).parse(formData.get("calendarId"));
  const additionalGuestEmails=Array.from(new Set(String(formData.get("additionalGuestEmails")??"").split(/[\s,;]+/).map((value)=>value.trim().toLowerCase()).filter(Boolean)));
  if(additionalGuestEmails.some((email)=>!z.string().email().safeParse(email).success))redirect(calendarPath(projectId,"Every additional calendar guest must be a valid email address.",true));
  const {error}=await supabase.from("project_google_calendar_settings").upsert({project_id:projectId,enabled:formData.get("enabled")==="on",calendar_id:calendarId,invite_directorial_team:formData.get("inviteDirectorialTeam")==="on",additional_guest_emails:additionalGuestEmails,updated_at:new Date().toISOString(),updated_by:user.id},{onConflict:"project_id"});
  if(error)redirect(calendarPath(projectId,error.message,true));redirect(calendarPath(projectId,"Google Calendar invitation settings saved."));
}

export async function testAuditionCalendarAction(formData:FormData){
  const projectId=uuid.parse(formData.get("projectId"));const {supabase}=await context(projectId);const {data:settings}=await supabase.from("project_google_calendar_settings").select("calendar_id").eq("project_id",projectId).maybeSingle();if(!settings)redirect(calendarPath(projectId,"Save the calendar settings before testing the connection.",true));
  let calendarName=settings.calendar_id;
  try{const result=await testGoogleCalendarAccess(settings.calendar_id);calendarName=String(result.calendarName??settings.calendar_id);await supabase.from("project_google_calendar_settings").update({last_tested_at:new Date().toISOString(),last_error:""}).eq("project_id",projectId);}catch(error){const message=error instanceof Error?error.message:"Calendar connection failed.";await supabase.from("project_google_calendar_settings").update({last_tested_at:new Date().toISOString(),last_error:message}).eq("project_id",projectId);redirect(calendarPath(projectId,message,true));}
  redirect(calendarPath(projectId,`Connected to ${calendarName}.`));
}

export async function syncExistingAuditionCalendarAction(formData:FormData){
  const projectId=uuid.parse(formData.get("projectId"));const {supabase}=await context(projectId);const {data:slots}=await supabase.from("audition_slots").select("id,audition_sessions!inner(project_id)").eq("audition_sessions.project_id",projectId);
  let result:Awaited<ReturnType<typeof syncAuditionCalendarSlots>>;
  try{result=await syncAuditionCalendarSlots(projectId,(slots??[]).map((slot)=>String(slot.id)));}catch(error){redirect(calendarPath(projectId,error instanceof Error?error.message:"Calendar sync failed.",true));}
  if(result.status==="skipped")redirect(calendarPath(projectId,"Turn on calendar invitations and save the project settings before synchronizing.",true));
  redirect(calendarPath(projectId,result.warnings.length?`Calendar sync finished with warnings: ${result.warnings.join(" ")}`:"All current audition bookings were synchronized."));
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
    settings: {}
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
  const startsAt = easternDate(z.string().min(1).parse(formData.get("startsAt")));
  const endsAt = easternDate(z.string().min(1).parse(formData.get("endsAt")));
  const interval = z.coerce.number().int().min(1).max(240).parse(formData.get("intervalMinutes"));
  const capacity = z.coerce.number().int().min(1).max(500).parse(formData.get("capacity"));
  const sessionType = z.enum(["appointments", "group_call", "workshop", "walk_in", "callback"]).parse(formData.get("sessionType"));
  const requestedBookingMode = z.enum(["self_book", "staff_assigned", "walk_in"]).parse(formData.get("bookingMode"));
  const bookingMode=sessionType==="callback"?"staff_assigned":requestedBookingMode;
  const bookingCategory=z.string().trim().min(1).max(80).regex(/^[a-z0-9_]+$/).parse(String(formData.get("bookingCategory")??"general").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,""));
  const autoAssignSessionId=await linkedSessionId(supabase,projectId,formData.get("autoAssignSessionId"));
  if (!(endsAt > startsAt)) redirect(schedulePath(projectId, "Session end must be after its start.", true));
  const { data: session, error } = await supabase.from("audition_sessions").insert({
    project_id: projectId, title, location, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), booking_category:bookingCategory,auto_assign_session_id:autoAssignSessionId,
    interval_minutes: interval, slots_per_interval: capacity, capacity, session_type: sessionType, booking_mode: bookingMode,
    instructions: String(formData.get("instructions") ?? ""), is_published: formData.get("isPublished") === "on"
    ,booking_opens_at: sessionType!=="callback"&&String(formData.get("bookingOpensAt") ?? "") ? easternDate(String(formData.get("bookingOpensAt"))).toISOString() : null
    ,booking_closes_at: sessionType!=="callback"&&String(formData.get("bookingClosesAt") ?? "") ? easternDate(String(formData.get("bookingClosesAt"))).toISOString() : null
    ,reschedule_deadline: sessionType!=="callback"&&String(formData.get("rescheduleDeadline") ?? "") ? easternDate(String(formData.get("rescheduleDeadline"))).toISOString() : null
    ,cancel_deadline: sessionType!=="callback"&&String(formData.get("cancelDeadline") ?? "") ? easternDate(String(formData.get("cancelDeadline"))).toISOString() : null
  }).select("id").single();
  if (error || !session) redirect(schedulePath(projectId, error?.message ?? "Could not create session.", true));
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
  if (slotsError) redirect(schedulePath(projectId, slotsError.message, true));
  redirect(schedulePath(projectId, `${rows.length} audition slot${rows.length === 1 ? "" : "s"} created.`));
}

export async function updateAuditionSessionAction(formData:FormData){
  const projectId=uuid.parse(formData.get("projectId"));const sessionId=uuid.parse(formData.get("sessionId"));const {supabase}=await context(projectId);
  const title=z.string().trim().min(1).max(200).parse(formData.get("title"));const location=z.string().trim().max(200).parse(formData.get("location"));const startsAt=easternDate(z.string().min(1).parse(formData.get("startsAt")));const endsAt=easternDate(z.string().min(1).parse(formData.get("endsAt")));if(!(endsAt>startsAt))redirect(schedulePath(projectId,"Session end must be after its start.",true));
  const interval=z.coerce.number().int().min(1).max(240).parse(formData.get("intervalMinutes"));const capacity=z.coerce.number().int().min(1).max(500).parse(formData.get("capacity"));const sessionType=z.enum(["appointments","group_call","workshop","walk_in","callback"]).parse(formData.get("sessionType"));const requestedBookingMode=z.enum(["self_book","staff_assigned","walk_in"]).parse(formData.get("bookingMode"));const bookingMode=sessionType==="callback"?"staff_assigned":requestedBookingMode;const bookingCategory=z.string().trim().min(1).max(80).regex(/^[a-z0-9_]+$/).parse(String(formData.get("bookingCategory")??"general").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,""));
  const autoAssignSessionId=await linkedSessionId(supabase,projectId,formData.get("autoAssignSessionId"),sessionId);
  const {data:current,error:currentError}=await supabase.from("audition_sessions").select("id,starts_at,ends_at,interval_minutes,capacity,session_type,booking_mode,booking_category").eq("id",sessionId).eq("project_id",projectId).maybeSingle();if(currentError||!current)redirect(schedulePath(projectId,currentError?.message??"Audition block not found.",true));
  const structuralChange=new Date(current.starts_at).getTime()!==startsAt.getTime()||new Date(current.ends_at).getTime()!==endsAt.getTime()||Number(current.interval_minutes)!==interval||Number(current.capacity)!==capacity||current.session_type!==sessionType||current.booking_mode!==bookingMode||current.booking_category!==bookingCategory;
  const dateValue=(name:string)=>sessionType!=="callback"&&String(formData.get(name)??"")?easternDate(String(formData.get(name))).toISOString():"";const update={title,location,starts_at:startsAt.toISOString(),ends_at:endsAt.toISOString(),booking_category:bookingCategory,auto_assign_session_id:autoAssignSessionId,interval_minutes:interval,capacity,session_type:sessionType,booking_mode:bookingMode,instructions:z.string().trim().max(4000).parse(formData.get("instructions")),is_published:formData.get("isPublished")==="on",booking_opens_at:dateValue("bookingOpensAt"),booking_closes_at:dateValue("bookingClosesAt"),reschedule_deadline:dateValue("rescheduleDeadline"),cancel_deadline:dateValue("cancelDeadline")};const rows:Array<Record<string,unknown>>=[];if(structuralChange){if(sessionType==="appointments"){for(let cursor=startsAt.getTime();cursor<endsAt.getTime();cursor+=interval*60_000){const slotEnd=Math.min(cursor+interval*60_000,endsAt.getTime());rows.push({starts_at:new Date(cursor).toISOString(),ends_at:new Date(slotEnd).toISOString(),capacity,slot_type:capacity===1?"individual":"group",self_bookable:bookingMode==="self_book"});}}else rows.push({starts_at:startsAt.toISOString(),ends_at:endsAt.toISOString(),capacity,slot_type:sessionType,self_bookable:bookingMode==="self_book"});}
  const {error:updateError}=await supabase.rpc("update_audition_session_block",{target_project_id:projectId,target_session_id:sessionId,session_payload:update,slot_payload:rows,rebuild_slots:structuralChange});if(updateError)redirect(schedulePath(projectId,updateError.message.includes("already has applicant bookings")?"This block already has applicant bookings. You can still edit its title, location, instructions, deadlines, and visibility, but its times, format, category, interval, booking mode, and capacity are locked to protect those bookings.":updateError.message,true));
  const {error:linkError}=await supabase.from("audition_sessions").update({auto_assign_session_id:autoAssignSessionId}).eq("id",sessionId).eq("project_id",projectId);if(linkError)redirect(schedulePath(projectId,linkError.message,true));
  let calendarWarning="";let calendarUpdated=false;const {data:sessionSlots}=await supabase.from("audition_slots").select("id").eq("session_id",sessionId);try{const result=await syncAuditionCalendarSlots(projectId,(sessionSlots??[]).map((slot)=>String(slot.id)));calendarWarning=result.warnings.join(" ");calendarUpdated=result.status==="synced";}catch(error){calendarWarning=error instanceof Error?error.message:"Calendar sync failed.";}
  redirect(schedulePath(projectId,calendarWarning?`Audition block saved, but calendar updates need attention: ${calendarWarning}`:structuralChange?"Audition block updated and its available slots were rebuilt.":calendarUpdated?"Audition block details and calendar invitations were updated.":"Audition block details updated."));
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
    scheduled_starts_at: String(formData.get("scheduledStartsAt") ?? "") ? easternDate(String(formData.get("scheduledStartsAt"))).toISOString() : null,
    scheduled_ends_at: String(formData.get("scheduledEndsAt") ?? "") ? easternDate(String(formData.get("scheduledEndsAt"))).toISOString() : null,
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
  const { error } = await supabase.from("audition_reviews").upsert({
    submission_id: submissionId, reviewer_user_id: user.id, rubric:{},
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
  const {supabase,user}=await projectManagerContext(projectId);
  const {data:person,error:personError}=await supabase.from("people").select("id,auth_user_id,full_name,email").eq("id",personId).maybeSingle();
  if(personError||!person)redirect(path(projectId,personError?.message??"Staff profile not found.",true));
  if(!person.auth_user_id){if(!String(person.email??"").trim())redirect(path(projectId,"Add an email address to this person before sending audition access.",true));const {error:inviteError}=await supabase.from("audition_access_invites").upsert({project_id:projectId,person_id:person.id,reviewer_role:reviewerRole,invited_by:user.id,claimed_by:null,claimed_at:null,updated_at:new Date().toISOString()},{onConflict:"project_id,person_id,reviewer_role"});if(inviteError)redirect(path(projectId,inviteError.message,true));try{const result=await sendAuditionAccessInvite({projectId,personId:person.id,reviewerRole,actorUserId:user.id});redirect(path(projectId,`${person.full_name} was invited as ${reviewerRole.replace(/_/g," ")}. Their access will activate automatically when they open the secure email sent to ${result.email}.`));}catch(error){await supabase.from("audition_access_invites").delete().eq("project_id",projectId).eq("person_id",person.id).eq("reviewer_role",reviewerRole);redirect(path(projectId,error instanceof Error?error.message:"Audition access invitation failed.",true));}}
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
