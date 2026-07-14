import { SITE_URL } from "@/lib/config";
import { activeEmailTemplate } from "@/lib/email-template-catalog";
import { syncAssignmentGoogleAutomation } from "@/lib/google-group-automation";
import { renderTemplate,sendHtmlEmail } from "@/lib/outbound-email";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { syncAssignmentToPlaybill } from "@/lib/playbill-sync";

export async function ensureRoleAcceptanceRequest(projectId:string, assignmentId:string, actorUserId:string|null, send=true, respectAutoSend=false){
  const admin=createSupabaseAdminClient();
  const {data:assignment,error}=await admin.from("role_assignments").select("id,person_id,status,people(full_name,preferred_name,email,person_type),project_roles(name,role_group),projects(title)").eq("id",assignmentId).eq("project_id",projectId).maybeSingle();
  if(error||!assignment) throw new Error(error?.message??"Assignment not found.");
  const person=assignment.people as unknown as {full_name:string;preferred_name:string;email:string;person_type:string}|null; const role=assignment.project_roles as unknown as {name:string;role_group:string}|null; const project=assignment.projects as unknown as {title:string}|null;
  if(person?.person_type!=="student") return {status:"not_required",warnings:[] as string[]};
  const type=role?.role_group==="cast"?"cast":"crew";
  const {data:template}=await admin.from("role_acceptance_templates").select("*").eq("template_type",type).eq("active",true).order("version",{ascending:false}).limit(1).maybeSingle();
  if(!template) throw new Error(`No active ${type} acceptance template is configured.`);
  const {data:projectSettings}=await admin.from("project_role_acceptance_settings").select("*").eq("project_id",projectId).maybeSingle();
  const days=Number(projectSettings?.expires_days??14);
  let {data:request}=await admin.from("role_acceptance_requests").select("*").eq("role_assignment_id",assignmentId).maybeSingle();
  if(!request){const customSections=type==="cast"?projectSettings?.cast_sections:projectSettings?.crew_sections;const customIntroduction=type==="cast"?projectSettings?.cast_introduction:projectSettings?.crew_introduction;const snapshot={name:template.name,type:template.template_type,version:template.version,introduction:customIntroduction||template.introduction,sections:Array.isArray(customSections)?customSections:template.sections,credit_options:template.credit_options,project_title:project?.title??"Production",role_name:role?.name??"Role",schedule:{rehearsals:String(projectSettings?.rehearsal_schedule??""),tech_and_dress:String(projectSettings?.tech_schedule??""),performances_and_strike:String(projectSettings?.performance_schedule??"")}};const created=await admin.from("role_acceptance_requests").insert({project_id:projectId,role_assignment_id:assignmentId,person_id:assignment.person_id,template_id:template.id,template_snapshot:snapshot,created_by:actorUserId,expires_at:new Date(Date.now()+days*24*60*60*1000).toISOString()}).select("*").single();if(created.error||!created.data)throw new Error(created.error?.message??"Acceptance request could not be created.");request=created.data;}
  await admin.from("role_assignments").update({acceptance_required:true,onboarding_status:"acceptance_pending",confirmation_status:"not_sent",status:assignment.status==="draft"?"offered":assignment.status}).eq("id",assignmentId);
  if(!send||(respectAutoSend&&projectSettings?.auto_send===false)||["accepted","declined"].includes(String(request.status)))return {status:String(request.status),warnings:[] as string[]};
  if(respectAutoSend&&["sent","opened"].includes(String(request.status)))return {status:String(request.status),warnings:[] as string[]};
  if(!person?.email) return {status:"draft",warnings:["Add an email address before sending the acceptance form."]};
  const renewedExpiry=new Date(Date.now()+days*24*60*60*1000).toISOString();
  await admin.from("role_acceptance_requests").update({expires_at:renewedExpiry}).eq("id",request.id);
  const url=`${SITE_URL.replace(/\/+$/,"")}/role-acceptance/${request.public_token}`;
  const variables={person_name:person.preferred_name||person.full_name,project_title:project?.title??"Siena Theatre",role_name:role?.name??"a production participant",agreement_type:type,role_acceptance_url:url,expires_in:`${days} day${days===1?"":"s"}`};const mailTemplate=await activeEmailTemplate("role_acceptance",projectId);const subject=mailTemplate?renderTemplate(mailTemplate.subject_template,variables):`Role acceptance required: ${variables.project_title}`;const html=mailTemplate?renderTemplate(mailTemplate.body_template,variables,true):`<h1>${variables.project_title}</h1><p>Hello ${variables.person_name},</p><p>You have been selected as <strong>${variables.role_name}</strong>. Please complete the required ${type} agreement.</p><p><a href="${url}">Review and Accept My Role</a></p>`;
  try{await sendHtmlEmail({to:person.email,subject,html});await admin.from("role_acceptance_requests").update({status:"sent",sent_at:new Date().toISOString()}).eq("id",request.id);await admin.from("role_assignments").update({confirmation_status:"sent"}).eq("id",assignmentId);return {status:"sent",warnings:[] as string[]};}catch(e){return {status:"draft",warnings:[e instanceof Error?e.message:"Acceptance email failed."]};}
}

export async function beginAssignmentOnboarding(projectId:string, assignmentId:string, actorUserId:string|null){
  const admin=createSupabaseAdminClient();const {data}=await admin.from("role_assignments").select("people(person_type)").eq("id",assignmentId).eq("project_id",projectId).maybeSingle();const person=data?.people as unknown as {person_type:string}|null;
  if(person?.person_type==="student"){const result=await ensureRoleAcceptanceRequest(projectId,assignmentId,actorUserId,true,true);return {...result,deferPlaybill:true};}
  const result=await syncAssignmentGoogleAutomation(projectId,assignmentId,actorUserId);return {status:"onboarding",warnings:result.warnings,deferPlaybill:false};
}

export async function completeAcceptedOnboarding(requestId:string){
  const admin=createSupabaseAdminClient(); const {data:req}=await admin.from("role_acceptance_requests").select("project_id,role_assignment_id,person_id").eq("id",requestId).maybeSingle(); if(!req)throw new Error("Acceptance request not found.");
  await admin.from("role_assignments").update({status:"accepted",confirmation_status:"accepted",onboarding_status:"onboarding",onboarding_checklist:{agreement_confirmed:true,google_group_checked:false,welcome_sent:false,publicity_prepared:false}}).eq("id",req.role_assignment_id);
  const {data:person}=await admin.from("people").select("full_name,last_name,preferred_name,publicity_bio,publicity_headshot_url,publicity_profile_version").eq("id",req.person_id).maybeSingle();
  const preferred=String(person?.preferred_name??"").trim(); const last=String(person?.last_name??"").trim(); const credited=!preferred?String(person?.full_name??""):(!last||preferred.toLowerCase().endsWith(last.toLowerCase())?preferred:`${preferred} ${last}`);
  const pub=await admin.from("project_publicity_submissions").upsert({project_id:req.project_id,person_id:req.person_id,credited_name:credited,bio:person?.publicity_bio??"",headshot_url:person?.publicity_headshot_url??"",source_profile_version:Number(person?.publicity_profile_version??1),status:"draft",playbill_sync_status:"not_ready"},{onConflict:"project_id,person_id",ignoreDuplicates:true});
  const warnings:string[]=[]; if(pub.error)warnings.push(pub.error.message);
  try{await syncAssignmentToPlaybill(String(req.project_id),String(req.role_assignment_id));}catch(e){warnings.push(`Playbill: ${e instanceof Error?e.message:"sync failed"}`);}
  try{const result=await syncAssignmentGoogleAutomation(String(req.project_id),String(req.role_assignment_id),null);warnings.push(...result.warnings);}catch(e){warnings.push(e instanceof Error?e.message:"Google/Propared onboarding failed.");}
  const {data:assignment}=await admin.from("role_assignments").select("google_group_sync_status,welcome_email_status").eq("id",req.role_assignment_id).maybeSingle();
  await admin.from("role_assignments").update({onboarding_status:warnings.length?"attention":"publicity_pending",onboarding_checklist:{agreement_confirmed:true,google_group_checked:["verified","missing"].includes(String(assignment?.google_group_sync_status)),google_group_status:assignment?.google_group_sync_status,welcome_sent:["sent","already_sent"].includes(String(assignment?.welcome_email_status)),publicity_prepared:!pub.error,attention:warnings}}).eq("id",req.role_assignment_id);
  return {warnings};
}
