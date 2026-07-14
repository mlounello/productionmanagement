"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { emailTemplateTags } from "@/lib/email-template-catalog";
import { sanitizeRichText, stripRichTextToPlain } from "@/lib/rich-text";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const tag=z.enum(emailTemplateTags);
function path(message:string,error=false){return `/settings/email-templates?${error?"error":"success"}=${encodeURIComponent(message)}`;}
function values(formData:FormData){
  const primary=tag.safeParse(formData.get("primaryType"));
  const selected=z.array(tag).safeParse(formData.getAll("usageTags"));
  const tags=primary.success&&selected.success?[...new Set([primary.data,...selected.data])]:[];
  return z.object({name:z.string().trim().min(1).max(200),description:z.string().trim().max(1000),subject:z.string().trim().min(1).max(300),body:z.string().max(50000),projectId:z.union([z.string().uuid(),z.literal("")]),primaryType:tag,usageTags:z.array(tag).min(1),active:z.boolean()}).safeParse({name:formData.get("name"),description:formData.get("description"),subject:formData.get("subject"),body:String(formData.get("bodyHtml")??""),projectId:String(formData.get("projectId")??""),primaryType:primary.success?primary.data:"",usageTags:tags,active:formData.get("active")==="on"});
}

export async function createEmailTemplateAction(formData:FormData){
  await requireUser();const parsed=values(formData);if(!parsed.success)redirect(path(parsed.error.issues[0]?.message??"Review the template fields.",true));const body=sanitizeRichText(parsed.data.body);if(!stripRichTextToPlain(body))redirect(path("Email body is required.",true));const supabase=await createSupabaseServerClient();const {error}=await supabase.from("email_templates").insert({project_id:parsed.data.projectId||null,template_type:parsed.data.primaryType,usage_tags:parsed.data.usageTags,name:parsed.data.name,description:parsed.data.description,subject_template:parsed.data.subject,body_template:body,active:parsed.data.active});if(error)redirect(path(error.message,true));redirect(path("Email template created."));
}

export async function updateEmailTemplateAction(formData:FormData){
  await requireUser();const id=z.string().uuid().parse(formData.get("id"));const parsed=values(formData);if(!parsed.success)redirect(path(parsed.error.issues[0]?.message??"Review the template fields.",true));const body=sanitizeRichText(parsed.data.body);if(!stripRichTextToPlain(body))redirect(path("Email body is required.",true));const supabase=await createSupabaseServerClient();const {error}=await supabase.from("email_templates").update({project_id:parsed.data.projectId||null,template_type:parsed.data.primaryType,usage_tags:parsed.data.usageTags,name:parsed.data.name,description:parsed.data.description,subject_template:parsed.data.subject,body_template:body,active:parsed.data.active}).eq("id",id);if(error)redirect(path(error.message,true));redirect(path("Email template saved."));
}
