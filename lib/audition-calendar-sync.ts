import { ENABLE_GOOGLE_CALENDAR_SYNC } from "@/lib/config";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { deleteGoogleCalendarEvent, upsertGoogleCalendarEvent } from "@/lib/google-calendar-apps-script";

type SlotRow={id:string;starts_at:string;ends_at:string|null;google_calendar_event_id:string|null;audition_sessions:{title:string;location:string;project_id:string}|null};
const uniqueEmails=(values:string[])=>Array.from(new Set(values.map((value)=>value.trim().toLowerCase()).filter((value)=>value.includes("@"))));

export async function syncAuditionCalendarSlots(projectId:string,slotIds:string[]){
  const admin=createSupabaseAdminClient();
  if(!ENABLE_GOOGLE_CALENDAR_SYNC)return {status:"skipped" as const,warnings:[] as string[]};
  const uniqueSlotIds=Array.from(new Set(slotIds));
  if(!uniqueSlotIds.length)return {status:"skipped" as const,warnings:[] as string[]};
  const {data:settings,error:settingsError}=await admin.from("project_google_calendar_settings").select("enabled,calendar_id,invite_directorial_team,additional_guest_emails").eq("project_id",projectId).maybeSingle();
  if(settingsError)throw settingsError;
  if(!settings?.enabled)return {status:"skipped" as const,warnings:[] as string[]};
  const [projectResult,slotsResult,directorialResult]=await Promise.all([
    admin.from("projects").select("title").eq("id",projectId).maybeSingle(),
    admin.from("audition_slots").select("id,starts_at,ends_at,google_calendar_event_id,audition_sessions!inner(title,location,project_id)").in("id",uniqueSlotIds).eq("audition_sessions.project_id",projectId),
    settings.invite_directorial_team?admin.from("role_assignments").select("people(email),project_roles!inner(role_group)").eq("project_id",projectId).eq("project_roles.role_group","directorial_team").not("status","in","(declined,withdrawn)"):Promise.resolve({data:[]})
  ]);
  if(projectResult.error)throw projectResult.error;
  if(slotsResult.error)throw slotsResult.error;
  if("error" in directorialResult&&directorialResult.error)throw directorialResult.error;
  const project=projectResult.data;const slots=slotsResult.data;const directorial=directorialResult.data;
  const staffEmails=(directorial??[]).map((row)=>String((row.people as unknown as {email?:string}|null)?.email??""));
  const warnings:string[]=[];
  const submissionResults=new Map<string,{failed:string[];synced:boolean}>();
  for(const slot of (slots??[]) as unknown as SlotRow[]){
    let submissionIds:string[]=[];
    try{
      const {data:bookings,error:bookingsError}=await admin.from("audition_submission_slots").select("submission_id,audition_submissions!inner(cancelled_at,applicant_email)").eq("slot_id",slot.id).is("audition_submissions.cancelled_at",null);
      if(bookingsError)throw bookingsError;
      submissionIds=(bookings??[]).map((row)=>String(row.submission_id));
      const applicantEmails=(bookings??[]).map((row)=>String((row.audition_submissions as unknown as {applicant_email?:string}|null)?.applicant_email??""));
      const guestEmails=uniqueEmails([...applicantEmails,...staffEmails,...((settings.additional_guest_emails??[]) as string[])]);
      if(!guestEmails.length){
        if(slot.google_calendar_event_id)await deleteGoogleCalendarEvent(settings.calendar_id,slot.google_calendar_event_id);
        await admin.from("audition_slots").update({google_calendar_event_id:null,google_calendar_sync_status:"not_synced",google_calendar_sync_error:"",google_calendar_synced_at:new Date().toISOString()}).eq("id",slot.id);
        continue;
      }
      const session=slot.audition_sessions;
      const fallbackEnd=new Date(new Date(slot.starts_at).getTime()+5*60_000).toISOString();
      const result=await upsertGoogleCalendarEvent({calendarId:settings.calendar_id,eventId:slot.google_calendar_event_id,title:`${project?.title??"Production"} – ${session?.title??"Audition"}`,description:"Audition appointment managed by Production Management. Please contact the production team if you need assistance.",location:session?.location??"",startsAt:slot.starts_at,endsAt:slot.ends_at??fallbackEnd,guestEmails});
      await admin.from("audition_slots").update({google_calendar_event_id:String(result.eventId??slot.google_calendar_event_id??""),google_calendar_sync_status:"synced",google_calendar_sync_error:"",google_calendar_synced_at:new Date().toISOString()}).eq("id",slot.id);
      submissionIds.forEach((id)=>submissionResults.set(id,{failed:submissionResults.get(id)?.failed??[],synced:true}));
    }catch(error){const message=error instanceof Error?error.message:"Calendar sync failed.";warnings.push(message);submissionIds.forEach((id)=>{const current=submissionResults.get(id)??{failed:[],synced:false};submissionResults.set(id,{...current,failed:[...current.failed,message]});});await admin.from("audition_slots").update({google_calendar_sync_status:"failed",google_calendar_sync_error:message,google_calendar_synced_at:new Date().toISOString()}).eq("id",slot.id);}
  }
  const syncedAt=new Date().toISOString();
  for(const [submissionId,result] of submissionResults){
    const errors=Array.from(new Set(result.failed));
    await admin.from("audition_submissions").update({google_calendar_sync_status:errors.length?"failed":"synced",google_calendar_sync_error:errors.join(" "),google_calendar_synced_at:syncedAt}).eq("id",submissionId);
  }
  const uniqueWarnings=Array.from(new Set(warnings));
  return {status:uniqueWarnings.length?"failed" as const:"synced" as const,warnings:uniqueWarnings};
}

export async function syncAuditionSubmissionCalendar(submissionId:string){
  const admin=createSupabaseAdminClient();
  const {data:submission}=await admin.from("audition_submissions").select("project_id,audition_submission_slots(slot_id)").eq("id",submissionId).maybeSingle();
  if(!submission)return {status:"failed" as const,warnings:["Audition submission was not found for calendar sync."]};
  const result=await syncAuditionCalendarSlots(String(submission.project_id),((submission.audition_submission_slots??[]) as Array<{slot_id:string}>).map((row)=>row.slot_id));
  await admin.from("audition_submissions").update({google_calendar_sync_status:result.status,google_calendar_sync_error:result.warnings.join(" "),google_calendar_synced_at:new Date().toISOString()}).eq("id",submissionId);
  return result;
}
