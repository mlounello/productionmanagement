"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function saveProfileAccessTemplateAction(formData: FormData) {
  await requireUser();
  const parsed = z.object({
    subject: z.string().trim().min(1).max(240),
    body: z.string().trim().min(1).max(20000)
  }).safeParse({ subject: String(formData.get("subject") ?? ""), body: String(formData.get("body") ?? "") });
  if (!parsed.success) redirect(`/settings/profile-access?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid email template.")}`);

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase.from("email_templates").select("id").eq("template_type", "profile_access").is("project_id", null).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const payload = { name: "Profile access", subject_template: parsed.data.subject, body_template: parsed.data.body, active: true };
  const result = existing
    ? await supabase.from("email_templates").update(payload).eq("id", existing.id)
    : await supabase.from("email_templates").insert({ ...payload, project_id: null, template_type: "profile_access" });
  if (result.error) redirect(`/settings/profile-access?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath("/settings/profile-access");
  redirect("/settings/profile-access?success=Profile%20access%20email%20saved.");
}

export async function savePublicityReminderTemplateAction(formData: FormData) {
  await requireUser();
  const parsed = z.object({
    subject: z.string().trim().min(1).max(240),
    body: z.string().trim().min(1).max(20000)
  }).safeParse({ subject: String(formData.get("subject") ?? ""), body: String(formData.get("body") ?? "") });
  if (!parsed.success) redirect(`/settings/profile-access?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid reminder template.")}`);
  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase.from("email_templates").select("id").eq("template_type", "publicity_reminder").is("project_id", null).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const payload = { name: "Publicity reminder", subject_template: parsed.data.subject, body_template: parsed.data.body, active: true };
  const result = existing
    ? await supabase.from("email_templates").update(payload).eq("id", existing.id)
    : await supabase.from("email_templates").insert({ ...payload, project_id: null, template_type: "publicity_reminder" });
  if (result.error) redirect(`/settings/profile-access?error=${encodeURIComponent(result.error.message)}`);
  revalidatePath("/settings/profile-access");
  redirect("/settings/profile-access?success=Publicity%20reminder%20email%20saved.");
}
