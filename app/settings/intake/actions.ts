"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { sanitizeRichText } from "@/lib/rich-text";

const lines = (value: FormDataEntryValue | null) => [...new Set(String(value ?? "").split("\n").map((line)=>line.trim()).filter(Boolean))];

export async function saveTechnicalInterestFormAction(formData: FormData) {
  await requireUser();
  const parsed = z.object({ id:z.string().uuid(), title:z.string().trim().min(1).max(200), description:z.string().trim().max(4000), status:z.enum(["draft","published","archived"]) }).safeParse({ id:formData.get("id"), title:formData.get("title"), description:formData.get("description"), status:formData.get("status") });
  if(!parsed.success) redirect(`/settings/intake?error=${encodeURIComponent(parsed.error.issues[0]?.message??"Invalid settings.")}`);
  const supabase=await createSupabaseServerClient(); const {error}=await supabase.from("technical_interest_forms").update({ ...parsed.data, technical_options:lines(formData.get("technicalOptions")), vocal_range_options:lines(formData.get("vocalRangeOptions")), dance_style_options:lines(formData.get("danceStyleOptions")) }).eq("id",parsed.data.id);
  if(error) redirect(`/settings/intake?error=${encodeURIComponent(error.message)}`);
  redirect("/settings/intake?success=Technical%20interest%20form%20saved.");
}

export async function saveAcceptanceTemplateAction(formData:FormData){
  await requireUser(); const id=z.string().uuid().parse(formData.get("id")); const supabase=await createSupabaseServerClient();
  let sections:unknown; try{sections=JSON.parse(String(formData.get("sections")??"[]"));}catch{redirect("/settings/intake?error=Agreement%20section%20source%20could%20not%20be%20read.");}
  const sectionSchema=z.array(z.object({key:z.string().min(1),title:z.string(),body:z.string(),acknowledgement:z.string(),requires_response:z.boolean()})).max(30).refine((items)=>new Set(items.map((item)=>item.key)).size===items.length,"Each agreement section must have a unique key.");
  const parsed=z.object({name:z.string().trim().min(1).max(200),introduction:z.string().trim().max(5000),sections:sectionSchema,creditOptions:z.array(z.string()).min(1)}).safeParse({name:formData.get("name"),introduction:formData.get("introduction"),sections,creditOptions:lines(formData.get("creditOptions"))});
  if(!parsed.success) redirect(`/settings/intake?error=${encodeURIComponent(parsed.error.issues[0]?.message??"Invalid template.")}`);
  const cleanSections=parsed.data.sections.map((section)=>({...section,body:sanitizeRichText(section.body),acknowledgement:sanitizeRichText(section.acknowledgement)}));
  const {error}=await supabase.from("role_acceptance_templates").update({name:parsed.data.name,introduction:sanitizeRichText(parsed.data.introduction),sections:cleanSections,credit_options:parsed.data.creditOptions}).eq("id",id);
  if(error) redirect(`/settings/intake?error=${encodeURIComponent(error.message)}`); redirect("/settings/intake?success=Acceptance%20template%20saved.");
}
