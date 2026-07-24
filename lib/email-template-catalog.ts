import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const emailTemplateTags = ["profile_access","profile_update_reminder","publicity_reminder","submission_reminder","role_group_welcome","role_acceptance","profile_verification_code","cast_announcement","crew_announcement","role_confirmation","audition_reminder","audition_callback","recognition","custom"] as const;
export type EmailTemplateTag=(typeof emailTemplateTags)[number];

export const emailTemplateTagLabels:Record<EmailTemplateTag,string>={
  profile_access:"Profile access invitation",profile_update_reminder:"Profile update reminder",publicity_reminder:"Publicity reminder",submission_reminder:"Submission reminder",role_group_welcome:"Google / Propared welcome",role_acceptance:"Student role acceptance",profile_verification_code:"Intake verification code",cast_announcement:"Cast announcement campaign",crew_announcement:"Crew announcement campaign",role_confirmation:"Role confirmation campaign",audition_reminder:"Audition reminder campaign",audition_callback:"Audition callback campaign",recognition:"Recognition campaign",custom:"General campaign"
};

export const emailTemplateVariables:Record<EmailTemplateTag,string[]>={
  profile_access:["person_name","profile_access_url","expires_in"],profile_update_reminder:["person_name","project_title","profile_access_url","expires_in"],publicity_reminder:["person_name","project_title","outstanding_items","bio_due_date","headshot_due_date","profile_access_url","expires_in"],submission_reminder:["person_name","project_title","outstanding_items","profile_access_url"],role_group_welcome:["person_name","project_title","role_name","role_group","google_group_email","propared_rolegroup_link","profile_access_url"],role_acceptance:["person_name","project_title","role_name","agreement_type","attendance_policy","role_acceptance_url","expires_in"],profile_verification_code:["person_name","verification_code","expires_in"],cast_announcement:["person_name","project_title","role_name","role_group"],crew_announcement:["person_name","project_title","role_name","role_group"],role_confirmation:["person_name","project_title","role_name","role_group"],audition_reminder:["person_name","project_title"],audition_callback:["person_name","project_title","callback_response_url"],recognition:["person_name","project_title","recognition_title","recognition_issuer","recognition_date","recognition_description"],custom:["person_name","full_name","preferred_name","project_title","role_name","role_group"]
};

export async function activeEmailTemplate(tag:EmailTemplateTag,projectId:string|null=null,roleGroup:string|null=null){
  const admin=createSupabaseAdminClient();
  if(projectId&&roleGroup&&tag==="role_acceptance"){
    const {data:settings}=await admin.from("project_role_group_google_settings").select("role_acceptance_email_template_id").eq("project_id",projectId).eq("role_group",roleGroup).maybeSingle();
    if(settings?.role_acceptance_email_template_id){
      const {data:selected}=await admin.from("email_templates").select("id,name,subject_template,body_template,usage_tags").eq("id",settings.role_acceptance_email_template_id).eq("active",true).contains("usage_tags",[tag]).maybeSingle();
      if(selected)return selected;
    }
  }
  let query=admin.from("email_templates").select("id,name,subject_template,body_template,usage_tags").contains("usage_tags",[tag]).eq("active",true).order("updated_at",{ascending:false}).limit(1);
  query=projectId?query.eq("project_id",projectId):query.is("project_id",null);
  const {data}=await query.maybeSingle();
  if(data)return data;
  if(projectId)return activeEmailTemplate(tag,null);
  return null;
}
