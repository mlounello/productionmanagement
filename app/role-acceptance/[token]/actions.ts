"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { completeAcceptedOnboarding } from "@/lib/role-acceptance";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { notifyProjectManagers } from "@/lib/project-admin-notifications";
import { parseConflictResponses, parseOneOffConflicts, type ConflictCalendarSnapshot, type ConflictWindowSnapshot } from "@/lib/rehearsal-conflicts";

export async function submitRoleAcceptanceAction(formData:FormData){
  const token=z.string().uuid().parse(formData.get("token")); const requestId=z.string().uuid().parse(formData.get("requestId")); const decision=z.enum(["accept","decline"]).parse(formData.get("decision"));
  const typedName=z.string().trim().min(2).max(180).parse(formData.get("typedName")); const creditChoice=z.string().trim().min(1).max(120).parse(formData.get("creditChoice"));
  const sectionKeys=JSON.parse(String(formData.get("sectionKeys")??"[]")) as string[]; const acknowledgements=Object.fromEntries(sectionKeys.map((key)=>[key,formData.get(`ack_${key}`)==="on"]));
  if(decision==="accept"&&sectionKeys.some((key)=>!acknowledgements[key]))redirect(`/role-acceptance/${token}?error=${encodeURIComponent("Acknowledge every required section before accepting.")}`);
  const admin=createSupabaseAdminClient(); const {data:request}=await admin.from("role_acceptance_requests").select("id,status,expires_at,role_assignment_id,project_id,person_id,template_snapshot,people(full_name)").eq("id",requestId).eq("public_token",token).maybeSingle();
  if(!request)redirect(`/role-acceptance/${token}?error=${encodeURIComponent("Acceptance request not found.")}`); if(["accepted","declined"].includes(request.status))redirect(`/role-acceptance/${token}?submitted=true`); if(request.expires_at&&new Date(request.expires_at).getTime()<Date.now())redirect(`/role-acceptance/${token}?error=${encodeURIComponent("This role offer has expired. Contact the production manager.")}`);
  const snapshot=request.template_snapshot as {conflict_windows?:ConflictWindowSnapshot[];conflict_calendar?:ConflictCalendarSnapshot};
  let conflictWindows;let oneOffConflicts;try{conflictWindows=parseConflictResponses(String(formData.get("conflictResponses")??"[]"),snapshot.conflict_windows??[],decision==="accept");oneOffConflicts=parseOneOffConflicts(String(formData.get("oneOffConflicts")??"[]"),snapshot.conflict_windows??[],snapshot.conflict_calendar??null);}catch(error){redirect(`/role-acceptance/${token}?error=${encodeURIComponent(error instanceof Error?error.message:"Review every schedule response.")}`);}
  const answers={decision,typed_name:typedName,credit_choice:creditChoice,allergies:String(formData.get("allergies")??""),conflicts:String(formData.get("conflicts")??""),comments:String(formData.get("comments")??""),acknowledgements,conflict_windows:conflictWindows,one_off_conflicts:oneOffConflicts}; const now=new Date().toISOString();
  const {error}=await admin.from("role_acceptance_requests").update({status:decision==="accept"?"accepted":"declined",answers,submitted_at:now,accepted_at:decision==="accept"?now:null,declined_at:decision==="decline"?now:null}).eq("id",request.id); if(error)redirect(`/role-acceptance/${token}?error=${encodeURIComponent(error.message)}`);
  if(decision==="accept"&&snapshot.conflict_windows?.length){const conflictSave=await admin.from("rehearsal_conflict_responses").upsert({project_id:request.project_id,person_id:request.person_id,source_type:"role_acceptance",source_id:request.id,windows_snapshot:snapshot.conflict_windows,responses:conflictWindows,one_off_conflicts:oneOffConflicts,general_notes:String(formData.get("conflicts")??""),submitted_at:now,updated_at:now},{onConflict:"source_type,source_id"});if(conflictSave.error)redirect(`/role-acceptance/${token}?error=${encodeURIComponent(`Your agreement was saved, but the schedule response needs staff attention: ${conflictSave.error.message}`)}`);}
  if(decision==="accept"){try{await completeAcceptedOnboarding(request.id);}catch(e){redirect(`/role-acceptance/${token}?submitted=true&warning=${encodeURIComponent(e instanceof Error?e.message:"Onboarding needs staff attention.")}`);}}
  else await admin.from("role_assignments").update({status:"declined",confirmation_status:"declined",onboarding_status:"not_started"}).eq("id",request.role_assignment_id);
  try {
    const person = request.people as unknown as { full_name?: string } | null;
    await notifyProjectManagers({
      projectId: String(request.project_id),
      subject: `Role ${decision === "accept" ? "accepted" : "declined"}: ${person?.full_name ?? typedName}`,
      heading: `Role ${decision === "accept" ? "accepted" : "declined"}`,
      message: `${person?.full_name ?? typedName} ${decision === "accept" ? "accepted" : "declined"} their role. Open Onboarding to review the response and current workflow status.`,
      actionLabel: "Open onboarding",
      actionPath: `/projects/${request.project_id}/onboarding`,
      idempotencyKey: `role-acceptance-admin-${request.id}-${decision}`
    });
  } catch {}
  redirect(`/role-acceptance/${token}?submitted=true`);
}
