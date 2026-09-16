"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const windowSchema = z.object({
  projectId: z.string().uuid(), id: z.string().uuid().optional(), label: z.string().trim().min(1).max(160),
  recurrenceType: z.enum(["weekly", "date"]), dayOfWeek: z.coerce.number().int().min(0).max(6).optional(), eventDate: z.string().optional(),
  startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  callType: z.enum(["fixed", "flexible"]), maxCallMinutes: z.coerce.number().int().min(15).max(720).optional(),
  collectPreferences: z.boolean(), appliesTo: z.enum(["cast", "crew", "all"]), required: z.boolean(), instructions: z.string().trim().max(2000)
});
function mins(value: string) { const [h,m] = value.split(":").map(Number); return h*60+m; }
async function manager(projectId: string) {
  await requireUser(); const supabase=await createSupabaseServerClient();
  const [{data:projectRole},{data:appRole}]=await Promise.all([supabase.rpc("has_project_role",{target_project_id:projectId,allowed_roles:["project_manager","producer"]}),supabase.rpc("has_app_role",{allowed_roles:["admin","producer"]})]);
  if(!projectRole&&!appRole) throw new Error("Project-manager access is required."); return supabase;
}

export async function saveConflictWindowAction(formData: FormData): Promise<{error?:string;success?:string}> {
  const parsed=windowSchema.safeParse({
    projectId:formData.get("projectId"),id:formData.get("id")||undefined,label:formData.get("label"),recurrenceType:formData.get("recurrenceType"),
    dayOfWeek:formData.get("recurrenceType")==="weekly"?formData.get("dayOfWeek"):undefined,eventDate:String(formData.get("eventDate")??""),startsAt:formData.get("startsAt"),endsAt:formData.get("endsAt"),callType:formData.get("callType"),
    maxCallMinutes:formData.get("callType")==="flexible"?formData.get("maxCallMinutes"):undefined,collectPreferences:formData.get("collectPreferences")==="on",appliesTo:formData.get("appliesTo"),required:formData.get("required")==="on",instructions:formData.get("instructions")??""
  });
  if(!parsed.success)return{error:parsed.error.issues[0]?.message??"Review the availability window."};
  const input=parsed.data,duration=mins(input.endsAt)-mins(input.startsAt);
  if(duration<=0)return{error:"The ending time must be later than the starting time on the same day."};
  if(input.callType==="flexible"&&(!input.maxCallMinutes||input.maxCallMinutes>duration))return{error:"Maximum call length must fit inside the flexible window."};
  if(input.recurrenceType==="date"&&!/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate??""))return{error:"Choose the specific date."};
  try{
    const supabase=await manager(input.projectId); const values={project_id:input.projectId,label:input.label,recurrence_type:input.recurrenceType,day_of_week:input.recurrenceType==="weekly"?input.dayOfWeek:null,event_date:input.recurrenceType==="date"?input.eventDate:null,starts_at:input.startsAt,ends_at:input.endsAt,call_type:input.callType,max_call_minutes:input.callType==="flexible"?input.maxCallMinutes:null,collect_preferences:input.callType==="flexible"&&input.collectPreferences,applies_to:input.appliesTo,required:input.required,instructions:input.instructions,active:true};
    const result=input.id?await supabase.from("project_conflict_windows").update(values).eq("id",input.id).eq("project_id",input.projectId):await supabase.from("project_conflict_windows").insert(values);
    if(result.error)return{error:result.error.message}; revalidatePath(`/projects/${input.projectId}/conflicts`); return{success:input.id?"Availability window updated.":"Availability window added."};
  }catch(error){return{error:error instanceof Error?error.message:"Availability window could not be saved."};}
}

export async function setConflictWindowActiveAction(formData: FormData): Promise<{error?:string;success?:string}> {
  const parsed=z.object({projectId:z.string().uuid(),id:z.string().uuid(),active:z.enum(["true","false"])}).safeParse(Object.fromEntries(formData));
  if(!parsed.success)return{error:"Reload this availability window."};
  try{const supabase=await manager(parsed.data.projectId);const active=parsed.data.active==="true";const{error}=await supabase.from("project_conflict_windows").update({active}).eq("id",parsed.data.id).eq("project_id",parsed.data.projectId);if(error)return{error:error.message};revalidatePath(`/projects/${parsed.data.projectId}/conflicts`);return{success:active?"Availability window restored.":"Availability window archived. Existing signed responses are preserved."};}catch(error){return{error:error instanceof Error?error.message:"Window status could not be changed."};}
}

export async function createStandardConflictWindowsAction(formData: FormData): Promise<{error?:string;success?:string}> {
  const parsed=z.object({projectId:z.string().uuid()}).safeParse(Object.fromEntries(formData));if(!parsed.success)return{error:"Project unavailable."};
  try{const supabase=await manager(parsed.data.projectId);const{data:existing,error:readError}=await supabase.from("project_conflict_windows").select("day_of_week,starts_at,ends_at,call_type").eq("project_id",parsed.data.projectId).eq("active",true);if(readError)return{error:readError.message};
    const candidates:Array<Record<string,unknown>&{day_of_week:number;starts_at:string;ends_at:string;call_type:string}>=[...[1,2,3,4].map((day)=>({project_id:parsed.data.projectId,label:`${["Sunday","Monday","Tuesday","Wednesday","Thursday"][day]} rehearsal`,recurrence_type:"weekly",day_of_week:day,event_date:null,starts_at:"18:00",ends_at:"22:00",call_type:"fixed",max_call_minutes:null,collect_preferences:false,applies_to:"cast",required:true,instructions:"Mark any class, work, or other conflict."})) ,{project_id:parsed.data.projectId,label:"Sunday rehearsal window",recurrence_type:"weekly",day_of_week:0,event_date:null,starts_at:"10:00",ends_at:"18:00",call_type:"flexible",max_call_minutes:240,collect_preferences:true,applies_to:"cast",required:true,instructions:"The rehearsal will last no more than four hours within this window."}];
    const key=(row:{day_of_week:number|null;starts_at:string;ends_at:string;call_type:string})=>`${row.day_of_week}-${row.starts_at.slice(0,5)}-${row.ends_at.slice(0,5)}-${row.call_type}`;const known=new Set((existing??[]).map(key));const missing=candidates.filter((row)=>!known.has(key(row)));
    if(!missing.length)return{success:"The standard Siena availability windows are already configured."};const{error}=await supabase.from("project_conflict_windows").insert(missing);if(error)return{error:error.message};revalidatePath(`/projects/${parsed.data.projectId}/conflicts`);return{success:`Added ${missing.length} standard availability window${missing.length===1?"":"s"}.`};
  }catch(error){return{error:error instanceof Error?error.message:"Standard windows could not be added."};}
}
