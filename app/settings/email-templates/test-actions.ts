"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { SITE_URL } from "@/lib/config";
import { renderTemplate, sendHtmlEmail } from "@/lib/outbound-email";
import { sanitizeRichText } from "@/lib/rich-text";
import { formatRoleGroupWelcomeEmail } from "@/lib/role-group-welcome-email";
import { formatPublicityReminderEmail } from "@/lib/publicity-reminder-email";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const schema = z.object({
  templateId: z.string().uuid(),
  testEmail: z.string().trim().email(),
  projectId: z.union([z.string().uuid(), z.literal("")]),
  personName: z.string().trim().min(1).max(160),
  roleName: z.string().trim().min(1).max(180),
  roleGroup: z.string().trim().max(100)
});

function date(value: string | null | undefined) {
  return value
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" })
    : "Not set";
}

export async function sendEmailTemplateTestAction(formData: FormData) {
  const user = await requireUser();
  const parsed = schema.safeParse({
    templateId: formData.get("templateId"),
    testEmail: formData.get("testEmail"),
    projectId: String(formData.get("projectId") ?? ""),
    personName: formData.get("personName"),
    roleName: formData.get("roleName"),
    roleGroup: String(formData.get("roleGroup") ?? "")
  });
  if (!parsed.success) {
    redirect(`/settings/email-templates?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Review the preview fields.")}`);
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: template }, { data: project }, { data: group }, { data: publicity }] = await Promise.all([
    supabase.from("email_templates").select("id,name,subject_template,body_template,usage_tags").eq("id", parsed.data.templateId).eq("active", true).maybeSingle(),
    parsed.data.projectId ? supabase.from("projects").select("title").eq("id", parsed.data.projectId).maybeSingle() : Promise.resolve({ data: null }),
    parsed.data.projectId && parsed.data.roleGroup
      ? supabase.from("project_role_group_google_settings").select("active_google_group_email,propared_role_group_link").eq("project_id", parsed.data.projectId).eq("role_group", parsed.data.roleGroup).maybeSingle()
      : Promise.resolve({ data: null }),
    parsed.data.projectId ? supabase.from("project_publicity_settings").select("bio_due_on,headshot_due_on").eq("project_id", parsed.data.projectId).maybeSingle() : Promise.resolve({ data: null })
  ]);
  if (!template) redirect("/settings/email-templates?error=Template%20not%20found%20or%20inactive.");

  const base = SITE_URL.replace(/\/+$/, "");
  const projectTitle = String(project?.title ?? "Sample Production");
  const variables = {
    person_name: parsed.data.personName,
    full_name: parsed.data.personName,
    preferred_name: parsed.data.personName.split(" ")[0] || parsed.data.personName,
    project_title: projectTitle,
    role_name: parsed.data.roleName,
    role_group: (parsed.data.roleGroup || "production_team").replace(/_/g, " "),
    google_group_email: String(group?.active_google_group_email ?? "sample-production-group@siena.edu"),
    propared_rolegroup_link: String(group?.propared_role_group_link ?? base),
    profile_access_url: `${base}/profile-access`,
    role_acceptance_url: base,
    expires_in: "7 days",
    agreement_type: "cast",
    attendance_policy: "Attendance policy: Three unexcused absences may result in removal from the production. Each unexcused late arrival counts as one unexcused absence.",
    verification_code: "123456",
    outstanding_items: "show-specific bio, headshot, your approval",
    bio_due_date: date(publicity?.bio_due_on),
    headshot_due_date: date(publicity?.headshot_due_on),
    recognition_title: "Sample Recognition",
    recognition_issuer: "Siena Theatre",
    recognition_date: new Date().toLocaleDateString("en-US"),
    recognition_description: "A sample recognition description."
  };
  const subject = `[TEST] ${renderTemplate(template.subject_template, variables)}`;
  const templateSource = String(template.body_template);
  const rendered = sanitizeRichText(renderTemplate(templateSource, variables, true));
  const tags = template.usage_tags ?? [];
  const content = tags.includes("role_group_welcome")
    ? formatRoleGroupWelcomeEmail({ bodyHtml: rendered, templateSource, projectTitle, roleGroup: parsed.data.roleGroup || "production_team", profileAccessUrl: variables.profile_access_url })
    : tags.includes("publicity_reminder")
      ? formatPublicityReminderEmail({ bodyHtml: rendered, templateSource, projectTitle, profileAccessUrl: variables.profile_access_url, outstandingItems: ["show-specific bio", "headshot", "your approval"] })
      : rendered;
  const banner = `<div style="padding:12px;background:#fff3cd;border:1px solid #e6cc75;font-family:Arial,Helvetica,sans-serif"><strong>Template preview only.</strong> Sent only to ${parsed.data.testEmail}. Profile and acceptance links are safe substitutes and no workflow status was changed.</div>`;

  try {
    const provider = await sendHtmlEmail({ to: parsed.data.testEmail, subject, html: `${banner}${content}` });
    await supabase.from("email_messages").insert({
      project_id: parsed.data.projectId || null,
      template_id: template.id,
      message_type: "template_test",
      to_email: parsed.data.testEmail,
      subject,
      body: `${banner}${content}`,
      status: "sent",
      provider_message_id: provider.id,
      sent_at: new Date().toISOString(),
      created_by: user.id
    });
  } catch (error) {
    redirect(`/settings/email-templates?error=${encodeURIComponent(error instanceof Error ? error.message : "Test email failed.")}`);
  }
  redirect(`/settings/email-templates?success=${encodeURIComponent(`Test of ${template.name} sent only to ${parsed.data.testEmail}.`)}`);
}
