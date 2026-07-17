import { ENABLE_GOOGLE_GROUP_MEMBERSHIP_CHECK } from "@/lib/config";
import { checkGoogleGroupMembership } from "@/lib/google-group-membership";
import { renderTemplate, sendHtmlEmail } from "@/lib/outbound-email";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createProfileAccessUrl } from "@/lib/profile-access-links";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type Context = {
  assignmentId: string; projectId: string; personId: string; personName: string; personEmail: string;
  projectTitle: string; roleName: string; roleGroup: string; automationSkipped: boolean; automationSkipReason: string;
};

async function assignmentContext(supabase: Client, projectId: string, assignmentId: string): Promise<Context> {
  const { data, error } = await supabase.from("role_assignments").select("id, project_id, person_id, google_automation_skipped, google_automation_skip_reason, project_roles(name, role_group), people(full_name, preferred_name, email), projects(title)").eq("id", assignmentId).eq("project_id", projectId).single();
  if (error || !data) throw new Error(error?.message ?? "Assignment not found.");
  const person = data.people as unknown as { full_name: string; preferred_name: string; email: string } | null;
  const role = data.project_roles as unknown as { name: string; role_group: string } | null;
  const project = data.projects as unknown as { title: string } | null;
  return { assignmentId, projectId, personId: String(data.person_id), personName: person?.preferred_name || person?.full_name || "Production team member", personEmail: person?.email?.trim().toLowerCase() || "", projectTitle: project?.title || "Production", roleName: role?.name || "Role", roleGroup: role?.role_group || "", automationSkipped: Boolean(data.google_automation_skipped), automationSkipReason: String(data.google_automation_skip_reason ?? "") };
}

async function log(supabase: Client, context: Context, settings: { active_google_group_email?: string }, actionType: string, status: "success" | "failed" | "skipped", actorUserId: string | null, errorMessage = "", providerResponse: Record<string, unknown> = {}) {
  await supabase.from("google_group_action_log").insert({ project_id: context.projectId, role_group: context.roleGroup, role_assignment_id: context.assignmentId, person_id: context.personId, actor_user_id: actorUserId, email_address: context.personEmail, active_google_group_email: settings.active_google_group_email ?? "", action_type: actionType, status, error_message: errorMessage, provider_response: providerResponse });
}

async function sendWelcome(supabase: Client, context: Context, settings: Record<string, unknown>, actorUserId: string | null, forceResend = false, manualSend = false) {
  if (!settings.welcome_email_template_id) return { status: "skipped", warning: "Select and save a welcome email template first." };
  if (!manualSend && !settings.welcome_email_enabled) return { status: "skipped", warning: "" };
  if (!context.personEmail) {
    const message = "Person does not have an email address."; await log(supabase, context, settings, "welcome_email_failed", "failed", actorUserId, message); return { status: "failed", warning: message };
  }
  const { data: delivered } = await supabase.from("google_group_welcome_deliveries").select("id, resent_count").eq("project_id", context.projectId).eq("role_group", context.roleGroup).eq("person_id", context.personId).maybeSingle();
  if (delivered && !forceResend) return { status: "already_sent", warning: "" };
  const { data: template, error: templateError } = await supabase.from("email_templates").select("id, subject_template, body_template").eq("id", String(settings.welcome_email_template_id)).eq("active", true).single();
  if (templateError || !template) {
    const message = templateError?.message ?? "Welcome email template is unavailable."; await log(supabase, context, settings, "welcome_email_failed", "failed", actorUserId, message); return { status: "failed", warning: message };
  }
  const profileAccess = await createProfileAccessUrl({ id: context.personId, email: context.personEmail }, actorUserId);
  const variables = { person_name: context.personName, project_title: context.projectTitle, role_name: context.roleName, role_group: context.roleGroup.replace(/_/g, " "), google_group_email: String(settings.active_google_group_email ?? ""), propared_rolegroup_link: String(settings.propared_role_group_link ?? ""), profile_access_url: profileAccess.url };
  const subject = renderTemplate(String(template.subject_template), variables); let html = renderTemplate(String(template.body_template), variables, true);
  if(!String(template.body_template).includes("{{profile_access_url}}")) html += `<hr style="margin:28px 0;border:0;border-top:1px solid #d7e2dc"><h2>Complete your public production profile</h2><p>Use Production Management to review your contact information, add a reusable headshot, and prepare your show-specific biography for Playbill.</p><p style="margin:24px 0"><a href="${profileAccess.url}" style="background:#006b54;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Open My Production Profile</a></p><p>This private link is already connected to the email address where this message was delivered. No account setup or email re-entry is required, and the link should not be shared.</p>`;
  const { data: message } = await supabase.from("email_messages").insert({ project_id: context.projectId, person_id: context.personId, template_id: template.id, message_type: "role_group_welcome", to_email: context.personEmail, subject, body: html, status: "queued", created_by: actorUserId }).select("id").single();
  try {
    const provider = await sendHtmlEmail({ to: context.personEmail, subject, html });
    if (message?.id) await supabase.from("email_messages").update({ status: "sent", provider_message_id: provider.id, sent_at: new Date().toISOString() }).eq("id", message.id);
    if (delivered) await supabase.from("google_group_welcome_deliveries").update({ resent_count: Number(delivered.resent_count) + 1, last_resent_at: new Date().toISOString(), provider_message_id: provider.id, email_message_id: message?.id ?? null }).eq("id", delivered.id);
    else await supabase.from("google_group_welcome_deliveries").insert({ project_id: context.projectId, role_group: context.roleGroup, person_id: context.personId, role_assignment_id: context.assignmentId, template_id: template.id, email_message_id: message?.id ?? null, to_email: context.personEmail, provider_message_id: provider.id });
    await log(supabase, context, settings, forceResend ? "welcome_email_resent" : "welcome_email_sent", "success", actorUserId, "", { id: provider.id });
    return { status: "sent", warning: "" };
  } catch (error) {
    const warning = error instanceof Error ? error.message : "Welcome email failed.";
    if (message?.id) await supabase.from("email_messages").update({ status: "failed" }).eq("id", message.id);
    await log(supabase, context, settings, "welcome_email_failed", "failed", actorUserId, warning); return { status: "failed", warning };
  }
}

export async function checkAssignmentGoogleMembership(projectId: string, assignmentId: string, actorUserId: string | null = null) {
  const supabase = await createSupabaseServerClient(); const context = await assignmentContext(supabase, projectId, assignmentId);
  const { data: settings } = await supabase.from("project_role_group_google_settings").select("*").eq("project_id", projectId).eq("role_group", context.roleGroup).maybeSingle();
  if (context.automationSkipped) {
    await supabase.from("role_assignments").update({ google_group_sync_status: "skipped", google_group_sync_error: context.automationSkipReason, welcome_email_status: "skipped", welcome_email_error: context.automationSkipReason }).eq("id", assignmentId);
    return { warnings: [] as string[], skipped: true, status: "skipped" };
  }
  if (!settings) return { warnings: [] as string[], skipped: false, status: "not_configured" };
  const warnings: string[] = []; let groupStatus = "skipped";
  if (settings.google_group_sync_enabled && settings.active_google_group_email) {
    if (!ENABLE_GOOGLE_GROUP_MEMBERSHIP_CHECK) groupStatus = "disabled";
    else if (!context.personEmail) { groupStatus = "failed"; warnings.push("Google Group sync skipped because the person has no email address."); }
    else try {
      const isMember = await checkGoogleGroupMembership(settings.active_google_group_email, context.personEmail); groupStatus = isMember ? "verified" : "missing";
      const warning = isMember ? "" : `${context.personEmail} is not currently listed in ${settings.active_google_group_email}.`;
      if (warning) warnings.push(warning);
      await log(supabase, context, settings, isMember ? "membership_checked_present" : "membership_checked_missing", isMember ? "success" : "failed", actorUserId, warning, { isMember });
    } catch (error) { groupStatus = "failed"; const warning = error instanceof Error ? error.message : "Google Group membership check failed."; warnings.push(warning); await log(supabase, context, settings, "membership_check_failed", "failed", actorUserId, warning); }
  }
  await supabase.from("role_assignments").update({ google_group_sync_status: groupStatus, google_group_sync_error: ["failed", "missing"].includes(groupStatus) ? warnings[0] ?? "Membership check failed." : "", google_group_membership_checked_at: ["verified", "missing"].includes(groupStatus) ? new Date().toISOString() : null }).eq("id", assignmentId);
  await supabase.from("project_role_group_google_settings").update({ last_sync_status: groupStatus, last_sync_error: warnings.join(" "), last_synced_at: new Date().toISOString() }).eq("id", settings.id);
  return { warnings, skipped: false, status: groupStatus };
}

export async function syncAssignmentGoogleAutomation(projectId: string, assignmentId: string, actorUserId: string | null = null) {
  const membership = await checkAssignmentGoogleMembership(projectId, assignmentId, actorUserId);
  if (membership.skipped) return { warnings: [] as string[] };
  const supabase = await createSupabaseServerClient(); const context = await assignmentContext(supabase, projectId, assignmentId);
  const { data: settings } = await supabase.from("project_role_group_google_settings").select("*").eq("project_id", projectId).eq("role_group", context.roleGroup).maybeSingle();
  if (!settings) return { warnings: membership.warnings };
  const welcome = await sendWelcome(supabase, context, settings, actorUserId);
  await supabase.from("role_assignments").update({ welcome_email_status: welcome.status, welcome_email_error: welcome.warning }).eq("id", assignmentId);
  return { warnings: [...membership.warnings, ...(welcome.warning ? [welcome.warning] : [])] };
}

export async function removeAssignmentGoogleAutomation(projectId: string, assignmentId: string, actorUserId: string | null = null) {
  const supabase = await createSupabaseServerClient(); const context = await assignmentContext(supabase, projectId, assignmentId);
  if (context.automationSkipped) return { warnings: [] as string[] };
  const { data: settings } = await supabase.from("project_role_group_google_settings").select("*").eq("project_id", projectId).eq("role_group", context.roleGroup).maybeSingle();
  if (!settings?.remove_from_google_group_on_unassign || !settings.google_group_sync_enabled || !settings.active_google_group_email || !context.personEmail) return { warnings: [] as string[] };
  const warning = `Remove ${context.personEmail} manually from ${settings.active_google_group_email}.`;
  await log(supabase, context, settings, "member_removal_needed", "failed", actorUserId, warning);
  return { warnings: [warning] };
}

export async function resendAssignmentWelcome(projectId: string, assignmentId: string, actorUserId: string | null) {
  const supabase = await createSupabaseServerClient(); const context = await assignmentContext(supabase, projectId, assignmentId);
  if (context.automationSkipped) return { warnings: [context.automationSkipReason || "Communications are skipped for this assignment."] };
  const { data: settings } = await supabase.from("project_role_group_google_settings").select("*").eq("project_id", projectId).eq("role_group", context.roleGroup).single();
  const result = await sendWelcome(supabase, context, settings ?? {}, actorUserId, true, true); return { warnings: result.warning ? [result.warning] : [] };
}
