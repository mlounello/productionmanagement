"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createOrAdoptGoogleGroup, generateGoogleGroupEmail, testGoogleGroup } from "@/lib/google-groups";
import { resendAssignmentWelcome, syncAssignmentGoogleAutomation } from "@/lib/google-group-automation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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
  const { data: project } = await supabase.from("projects").select("slug").eq("id", projectId).single();
  if (!project) redirect(route(projectId, "Project not found.", true));
  const proposed = generateGoogleGroupEmail(String(project.slug), roleGroupSlug);
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
    remove_from_google_group_on_unassign: formData.get("removeOnUnassign") === "on"
  }, { onConflict: "project_id,role_group" });
  if (error) redirect(route(projectId, error.message, true)); revalidatePath(route(projectId)); redirect(route(projectId, "Role-group Google settings saved."));
}

export async function createRoleGroupGoogleGroupAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId")); const roleGroupSlug = roleGroup.parse(formData.get("roleGroup")); const { user, supabase } = await context(projectId);
  const [{ data: project }, { data: settings }] = await Promise.all([
    supabase.from("projects").select("title, slug").eq("id", projectId).single(),
    supabase.from("project_role_group_google_settings").select("id, proposed_google_group_email").eq("project_id", projectId).eq("role_group", roleGroupSlug).maybeSingle()
  ]);
  if (!project) redirect(route(projectId, "Project not found.", true));
  const proposed = settings?.proposed_google_group_email || generateGoogleGroupEmail(String(project.slug), roleGroupSlug);
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
  try { const group = await testGoogleGroup(settings.active_google_group_email); await supabase.from("google_group_action_log").insert({ project_id: projectId, role_group: roleGroupSlug, actor_user_id: user.id, active_google_group_email: settings.active_google_group_email, action_type: "group_tested", status: "success", provider_response: { id: group.id ?? "", email: group.email ?? "" } }); redirect(route(projectId, `Google Group connection succeeded: ${settings.active_google_group_email}`)); }
  catch (error) { const message = error instanceof Error ? error.message : "Google Group test failed."; await supabase.from("google_group_action_log").insert({ project_id: projectId, role_group: roleGroupSlug, actor_user_id: user.id, active_google_group_email: settings.active_google_group_email, action_type: "group_tested", status: "failed", error_message: message }); redirect(route(projectId, message, true)); }
}

export async function createRoleGroupWelcomeTemplateAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId")); const roleGroupSlug = roleGroup.parse(formData.get("roleGroup")); const { supabase } = await context(projectId);
  const subject = z.string().trim().min(1).max(300).parse(formData.get("subject")); const body = z.string().trim().min(1).max(50000).parse(formData.get("bodyHtml"));
  const { data: template, error } = await supabase.from("email_templates").insert({ project_id: projectId, template_type: "role_group_welcome", name: `${roleGroupSlug.replace(/_/g, " ")} welcome`, subject_template: subject, body_template: body }).select("id").single();
  if (error || !template) redirect(route(projectId, error?.message ?? "Could not create template.", true));
  await supabase.from("project_role_group_google_settings").upsert({ project_id: projectId, role_group: roleGroupSlug, welcome_email_template_id: template.id }, { onConflict: "project_id,role_group" });
  redirect(route(projectId, "HTML welcome template created and selected."));
}

export async function retryAssignmentGoogleSyncAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId")); const assignmentId = uuid.parse(formData.get("assignmentId")); const { user } = await context(projectId);
  const result = await syncAssignmentGoogleAutomation(projectId, assignmentId, user.id); redirect(route(projectId, result.warnings.length ? result.warnings.join(" ") : "Google Group membership and welcome automation completed.", result.warnings.length > 0));
}

export async function resendAssignmentWelcomeAction(formData: FormData) {
  const projectId = uuid.parse(formData.get("projectId")); const assignmentId = uuid.parse(formData.get("assignmentId")); const { user } = await context(projectId);
  const result = await resendAssignmentWelcome(projectId, assignmentId, user.id); redirect(route(projectId, result.warnings.length ? result.warnings.join(" ") : "Welcome email resent.", result.warnings.length > 0));
}
