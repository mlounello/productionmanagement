"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createOrAdoptGoogleGroup, generateGoogleGroupEmail } from "@/lib/google-groups";
import { testGoogleGroupMembershipAccess } from "@/lib/google-group-membership";
import { checkAssignmentGoogleMembership, resendAssignmentWelcome, syncAssignmentGoogleAutomation } from "@/lib/google-group-automation";
import { renderTemplate, sendHtmlEmail } from "@/lib/outbound-email";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { SITE_URL } from "@/lib/config";
import { sanitizeRichText } from "@/lib/rich-text";

const uuid = z.string().uuid();
const roleGroup = z.string().trim().min(1).max(100).regex(/^[a-z0-9_]+$/);
function route(projectId: string, message?: string, error = false) { return `/projects/${projectId}/google-groups${message ? `?${error ? "error" : "success"}=${encodeURIComponent(message)}` : ""}`; }

async function context(projectId: string) {
  const user = await requireUser(); const supabase = await createSupabaseServerClient();
  const { data: allowed } = await supabase.rpc("has_project_role", { target_project_id: uuid.parse(projectId), allowed_roles: ["project_manager", "producer"] });
  if (!allowed) throw new Error("Project manager access is required.");
  return { user, supabase };
}

export async function saveRoleGroupGoogleSettingsAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId")); const roleGroupSlug = roleGroup.parse(formData.get("roleGroup")); const { supabase } = await context(projectId);
  const mode = z.enum(["auto", "manual", "disabled"]).parse(formData.get("googleGroupMode"));
  const { data: project } = await supabase.from("projects").select("title").eq("id", projectId).single();
  if (!project) redirect(route(projectId, "Project not found.", true));
  const proposed = generateGoogleGroupEmail(String(project.title), roleGroupSlug);
  const manualEmail = z.string().trim().email().or(z.literal("")).parse(formData.get("manualGoogleGroupEmail"));
  const { data: existing } = await supabase.from("project_role_group_google_settings").select("active_google_group_email, google_group_creation_status").eq("project_id", projectId).eq("role_group", roleGroupSlug).maybeSingle();
  const activeEmail = mode === "manual" ? manualEmail.toLowerCase() : mode === "auto" ? String(existing?.active_google_group_email ?? "") : String(existing?.active_google_group_email ?? "");
  if (mode === "manual" && !activeEmail) redirect(route(projectId, "Enter the existing Google Group email for manual mode.", true));
  const { error } = await supabase.from("project_role_group_google_settings").upsert({
    project_id: projectId, role_group: roleGroupSlug, google_group_mode: mode,
    proposed_google_group_email: proposed, active_google_group_email: activeEmail,
    google_group_creation_status: mode === "manual" ? "manual" : mode === "disabled" ? "disabled" : existing?.google_group_creation_status ?? "not_attempted",
    google_group_sync_enabled: mode !== "disabled" && formData.get("googleGroupSyncEnabled") === "on",
    welcome_email_enabled: formData.get("welcomeEmailEnabled") === "on",
    welcome_email_template_id: String(formData.get("welcomeEmailTemplateId") ?? "") || null,
    propared_role_group_link: z.string().trim().url().or(z.literal("")).parse(formData.get("proparedRoleGroupLink")),
    remove_from_google_group_on_unassign: formData.get("removeOnUnassign") === "on"
  }, { onConflict: "project_id,role_group" });
  if (error) redirect(route(projectId, error.message, true)); revalidatePath(route(projectId)); redirect(route(projectId, "Role-group Google settings saved."));
}

export async function createRoleGroupGoogleGroupAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId")); const roleGroupSlug = roleGroup.parse(formData.get("roleGroup")); const { user, supabase } = await context(projectId);
  const { data: project } = await supabase.from("projects").select("title").eq("id", projectId).single();
  if (!project) redirect(route(projectId, "Project not found.", true));
  const proposed = generateGoogleGroupEmail(String(project.title), roleGroupSlug);
  let actionType = "group_created"; let status = "success"; let errorMessage = ""; let providerResponse: Record<string, unknown> = {};
  try {
    const result = await createOrAdoptGoogleGroup({ email: proposed, name: `${project.title} · ${roleGroupSlug.replace(/_/g, " ")}`, description: `Production communication group for ${project.title}: ${roleGroupSlug.replace(/_/g, " ")}.` });
    actionType = result.created ? "group_created" : "group_found"; providerResponse = { created: result.created, id: result.group.id ?? "", settings_warning: result.settingsWarning };
    await supabase.from("project_role_group_google_settings").upsert({ project_id: projectId, role_group: roleGroupSlug, google_group_mode: "auto", proposed_google_group_email: proposed, active_google_group_email: proposed, google_group_creation_status: "created", google_group_creation_error: result.settingsWarning, last_sync_status: "synced", last_sync_error: result.settingsWarning, last_synced_at: new Date().toISOString() }, { onConflict: "project_id,role_group" });
  } catch (error) {
    actionType = "group_creation_failed"; status = "failed"; errorMessage = error instanceof Error ? error.message : "Google Group creation failed.";
    await supabase.from("project_role_group_google_settings").upsert({ project_id: projectId, role_group: roleGroupSlug, google_group_mode: "auto", proposed_google_group_email: proposed, google_group_creation_status: "failed", google_group_creation_error: errorMessage, last_sync_status: "failed", last_sync_error: errorMessage, last_synced_at: new Date().toISOString() }, { onConflict: "project_id,role_group" });
  }
  await supabase.from("google_group_action_log").insert({ project_id: projectId, role_group: roleGroupSlug, actor_user_id: user.id, active_google_group_email: status === "success" ? proposed : "", action_type: actionType, status, error_message: errorMessage, provider_response: providerResponse });
  redirect(route(projectId, status === "success" ? `Google Group ${actionType === "group_found" ? "found and adopted" : "created"}: ${proposed}` : `${errorMessage} You can switch to manual mode and enter an existing group.`, status === "failed"));
}

export async function testRoleGroupGoogleGroupAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId")); const roleGroupSlug = roleGroup.parse(formData.get("roleGroup")); const { user, supabase } = await context(projectId);
  const { data: settings } = await supabase.from("project_role_group_google_settings").select("active_google_group_email").eq("project_id", projectId).eq("role_group", roleGroupSlug).single();
  if (!settings?.active_google_group_email) redirect(route(projectId, "Set an active Google Group email first.", true));
  try { const group = await testGoogleGroupMembershipAccess(settings.active_google_group_email); await supabase.from("google_group_action_log").insert({ project_id: projectId, role_group: roleGroupSlug, actor_user_id: user.id, active_google_group_email: settings.active_google_group_email, action_type: "group_tested", status: "success", provider_response: { email: String(group.groupEmail ?? settings.active_google_group_email) } }); redirect(route(projectId, `Apps Script can read the Google Group: ${settings.active_google_group_email}`)); }
  catch (error) { const message = error instanceof Error ? error.message : "Google Group test failed."; await supabase.from("google_group_action_log").insert({ project_id: projectId, role_group: roleGroupSlug, actor_user_id: user.id, active_google_group_email: settings.active_google_group_email, action_type: "group_tested", status: "failed", error_message: message }); redirect(route(projectId, message, true)); }
}

export async function createRoleGroupWelcomeTemplateAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId")); const roleGroupSlug = roleGroup.parse(formData.get("roleGroup")); const { supabase } = await context(projectId);
  const subject = z.string().trim().min(1).max(300).parse(formData.get("subject")); const body = sanitizeRichText(z.string().trim().min(1).max(50000).parse(formData.get("bodyHtml")));
  const { data: template, error } = await supabase.from("email_templates").insert({ project_id: projectId, template_type: "role_group_welcome", usage_tags:["role_group_welcome"], name: `${roleGroupSlug.replace(/_/g, " ")} welcome`, subject_template: subject, body_template: body }).select("id").single();
  if (error || !template) redirect(route(projectId, error?.message ?? "Could not create template.", true));
  await supabase.from("project_role_group_google_settings").upsert({ project_id: projectId, role_group: roleGroupSlug, welcome_email_template_id: template.id }, { onConflict: "project_id,role_group" });
  redirect(route(projectId, "HTML welcome template created and selected."));
}

export async function sendRoleGroupWelcomeTestAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId")); const roleGroupSlug = roleGroup.parse(formData.get("roleGroup")); const { user, supabase } = await context(projectId);
  const toEmail = z.string().trim().email().parse(formData.get("testEmail"));
  const previewName = z.string().trim().min(1).max(120).parse(formData.get("previewName"));
  const previewRole = z.string().trim().min(1).max(180).parse(formData.get("previewRole"));
  const [{ data: project }, { data: settings }] = await Promise.all([
    supabase.from("projects").select("title").eq("id", projectId).single(),
    supabase.from("project_role_group_google_settings").select("active_google_group_email, propared_role_group_link, welcome_email_template_id").eq("project_id", projectId).eq("role_group", roleGroupSlug).single()
  ]);
  if (!project || !settings?.welcome_email_template_id) redirect(route(projectId, "Select and save a welcome template before sending a test.", true));
  const { data: template, error: templateError } = await supabase.from("email_templates").select("subject_template, body_template").eq("id", settings.welcome_email_template_id).eq("active", true).single();
  if (templateError || !template) redirect(route(projectId, templateError?.message ?? "Welcome template not found.", true));
  const variables = { person_name: previewName, project_title: String(project.title), role_name: previewRole, role_group: roleGroupSlug.replace(/_/g, " "), google_group_email: String(settings.active_google_group_email ?? ""), propared_rolegroup_link: String(settings.propared_role_group_link ?? ""), profile_access_url: `${SITE_URL.replace(/\/+$/,"")}/profile-access` };
  const subject = `[TEST] ${renderTemplate(String(template.subject_template), variables)}`;
  const html = `<p style="padding:10px;background:#fff3cd;border:1px solid #e6cc75;"><strong>Test email:</strong> This preview was sent only to ${toEmail}. It did not contact the Google Group or mark a welcome email as delivered.</p>${renderTemplate(String(template.body_template), variables, true)}`;
  try {
    const provider = await sendHtmlEmail({ to: toEmail, subject, html });
    await supabase.from("google_group_action_log").insert({ project_id: projectId, role_group: roleGroupSlug, actor_user_id: user.id, email_address: toEmail, active_google_group_email: settings.active_google_group_email, action_type: "welcome_email_test_sent", status: "success", provider_response: { id: provider.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Test email failed.";
    await supabase.from("google_group_action_log").insert({ project_id: projectId, role_group: roleGroupSlug, actor_user_id: user.id, email_address: toEmail, active_google_group_email: settings.active_google_group_email, action_type: "welcome_email_test_failed", status: "failed", error_message: message });
    redirect(route(projectId, message, true));
  }
  redirect(route(projectId, `Test welcome email sent only to ${toEmail}.`));
}

export async function retryAssignmentGoogleSyncAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId")); const assignmentId = uuid.parse(formData.get("assignmentId")); const { user } = await context(projectId);
  const result = await checkAssignmentGoogleMembership(projectId, assignmentId, user.id); redirect(route(projectId, result.skipped ? "That assignment is skipped." : result.warnings.length ? result.warnings.join(" ") : result.status === "verified" ? "Google Group membership verified." : `Membership check status: ${result.status.replace(/_/g, " ")}.`, result.warnings.length > 0));
}

export async function recheckRoleGroupMembershipsAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId")); const roleGroupSlug = roleGroup.parse(formData.get("roleGroup")); const { user, supabase } = await context(projectId);
  const { data: roles, error: roleError } = await supabase.from("project_roles").select("id").eq("project_id", projectId).eq("role_group", roleGroupSlug);
  if (roleError) redirect(route(projectId, roleError.message, true));
  const roleIds = (roles ?? []).map((role) => String(role.id));
  const { data: assignments, error } = roleIds.length ? await supabase.from("role_assignments").select("id").eq("project_id", projectId).in("role_id", roleIds) : { data: [], error: null };
  if (error) redirect(route(projectId, error.message, true));
  let verified = 0; let needsAttention = 0; let skipped = 0;
  for (const assignment of assignments ?? []) {
    try { const result = await checkAssignmentGoogleMembership(projectId, String(assignment.id), user.id); if (result.skipped || !["verified", "missing", "failed"].includes(result.status)) skipped += 1; else if (result.warnings.length) needsAttention += 1; else verified += 1; }
    catch { needsAttention += 1; }
  }
  revalidatePath(route(projectId));
  redirect(route(projectId, `${roleGroupSlug.replace(/_/g, " ")}: ${verified} verified; ${needsAttention} need attention; ${skipped} skipped.`, needsAttention > 0));
}

export async function sendRoleGroupWelcomesAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId")); const roleGroupSlug = roleGroup.parse(formData.get("roleGroup")); const { user, supabase } = await context(projectId);
  const { data: settings } = await supabase.from("project_role_group_google_settings").select("welcome_email_template_id").eq("project_id", projectId).eq("role_group", roleGroupSlug).maybeSingle();
  if (!settings?.welcome_email_template_id) redirect(route(projectId, `Select and save a welcome template for ${roleGroupSlug.replace(/_/g, " ")} first.`, true));
  const { data: roles, error: roleError } = await supabase.from("project_roles").select("id").eq("project_id", projectId).eq("role_group", roleGroupSlug);
  if (roleError) redirect(route(projectId, roleError.message, true));
  const roleIds = (roles ?? []).map((item) => String(item.id));
  const { data: assignments, error } = roleIds.length ? await supabase.from("role_assignments").select("id").eq("project_id", projectId).in("role_id", roleIds) : { data: [], error: null };
  if (error) redirect(route(projectId, error.message, true));
  let sent = 0; const warnings: string[] = [];
  for (const assignment of assignments ?? []) {
    try { const result = await resendAssignmentWelcome(projectId, String(assignment.id), user.id); if (result.warnings.length) warnings.push(...result.warnings); else sent += 1; }
    catch (sendError) { warnings.push(sendError instanceof Error ? sendError.message : "Welcome email failed."); }
  }
  revalidatePath(route(projectId));
  const summary = `${roleGroupSlug.replace(/_/g, " ")}: ${sent} welcome email${sent === 1 ? "" : "s"} sent${warnings.length ? `; ${warnings.length} skipped or failed. ${warnings[0]}` : "."}`;
  redirect(route(projectId, summary, sent === 0 && warnings.length > 0));
}

export async function recheckAllGoogleMembershipsAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId")); const { user, supabase } = await context(projectId);
  const { data: assignments, error } = await supabase.from("role_assignments").select("id").eq("project_id", projectId);
  if (error) redirect(route(projectId, error.message, true));
  let verified = 0; let needsAttention = 0; let skipped = 0;
  for (const assignment of assignments ?? []) {
    try { const result = await checkAssignmentGoogleMembership(projectId, String(assignment.id), user.id); if (result.skipped || !["verified", "missing", "failed"].includes(result.status)) skipped += 1; else if (result.warnings.length) needsAttention += 1; else verified += 1; }
    catch { needsAttention += 1; }
  }
  revalidatePath(route(projectId));
  redirect(route(projectId, `All groups: ${verified} verified; ${needsAttention} need attention; ${skipped} skipped.`, needsAttention > 0));
}

export async function setAssignmentGoogleAutomationSkippedAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId")); const assignmentId = uuid.parse(formData.get("assignmentId")); const skipped = formData.get("skipped") === "true"; const { user, supabase } = await context(projectId);
  const reason = skipped ? z.string().trim().max(500).parse(formData.get("skipReason")) || "Excluded from role-group communications." : "";
  const { data: assignment, error: lookupError } = await supabase.from("role_assignments").select("id, person_id, project_roles(role_group), people(email)").eq("project_id", projectId).eq("id", assignmentId).single();
  if (lookupError || !assignment) redirect(route(projectId, lookupError?.message ?? "Assignment not found.", true));
  const { error } = await supabase.from("role_assignments").update({ google_automation_skipped: skipped, google_automation_skip_reason: reason, google_group_sync_status: skipped ? "skipped" : "not_attempted", google_group_sync_error: skipped ? reason : "", welcome_email_status: skipped ? "skipped" : "not_attempted", welcome_email_error: skipped ? reason : "" }).eq("id", assignmentId);
  if (error) redirect(route(projectId, error.message, true));
  const role = assignment.project_roles as unknown as { role_group: string } | null; const person = assignment.people as unknown as { email: string } | null;
  await supabase.from("google_group_action_log").insert({ project_id: projectId, role_group: role?.role_group ?? "", role_assignment_id: assignmentId, person_id: assignment.person_id, actor_user_id: user.id, email_address: person?.email ?? "", action_type: skipped ? "assignment_automation_skipped" : "assignment_automation_resumed", status: "success", error_message: reason });
  revalidatePath(route(projectId));
  redirect(route(projectId, skipped ? "Assignment excluded from group checks and welcome communications." : "Assignment communications restored; run a membership check when ready."));
}

export async function resendAssignmentWelcomeAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId")); const assignmentId = uuid.parse(formData.get("assignmentId")); const { user } = await context(projectId);
  const result = await resendAssignmentWelcome(projectId, assignmentId, user.id); redirect(route(projectId, result.warnings.length ? result.warnings.join(" ") : "Welcome email sent.", result.warnings.length > 0));
}
