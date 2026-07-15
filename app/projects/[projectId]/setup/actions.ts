"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const uuid = z.string().uuid();
const steps = z.enum(["workflow", "roles", "onboarding", "communications", "integrations", "review"]);
const roleGroups = z.enum(["cast", "creative_team", "directorial_team", "production_team", "administrative", "front_of_house", "music_band", "crew", "designer", "department_head", "staff", "guest_artist"]);

function route(projectId: string, step: z.infer<typeof steps>, error = "") {
  return `/projects/${projectId}/setup?step=${step}${error ? `&error=${encodeURIComponent(error)}` : ""}`;
}

async function requireSetupManager(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: projectAllowed }, { data: appAllowed }] = await Promise.all([
    supabase.rpc("has_project_role", { target_project_id: projectId, allowed_roles: ["project_manager", "producer"] }),
    supabase.rpc("has_app_role", { allowed_roles: ["admin", "producer"] })
  ]);
  if (!projectAllowed && !appAllowed) throw new Error("You do not have permission to configure this project.");
  return supabase;
}

export async function saveProjectWorkflowAction(formData: FormData) {
  const user = await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  const selected = z.array(roleGroups).safeParse(formData.getAll("roleGroup").map(String));
  if (!selected.success) redirect(route(projectId, "workflow", "One or more role groups are invalid."));
  const checked = (name: string) => formData.get(name) === "on";
  const usesRoleAcceptance = checked("usesRoleAcceptance");
  const usesGoogleGroups = checked("usesGoogleGroups");
  const usesPropared = checked("usesPropared");
  if ((usesRoleAcceptance || usesGoogleGroups || usesPropared) && !selected.data.length) {
    redirect(route(projectId, "workflow", "Select at least one role group for role-based automation."));
  }
  let supabase;
  try { supabase = await requireSetupManager(projectId); }
  catch (error) { redirect(route(projectId, "workflow", error instanceof Error ? error.message : "Permission denied.")); }
  const { error } = await supabase.from("project_setup_preferences").upsert({
    project_id: projectId,
    setup_status: "in_progress",
    current_step: "roles",
    uses_role_acceptance: usesRoleAcceptance,
    uses_google_groups: usesGoogleGroups,
    uses_propared: usesPropared,
    uses_playbill: checked("usesPlaybill"),
    uses_publicity: checked("usesPublicity"),
    uses_auditions: checked("usesAuditions"),
    uses_budget: checked("usesBudget"),
    selected_role_groups: selected.data,
    completed_at: null,
    updated_by: user.id
  }, { onConflict: "project_id" });
  if (error) redirect(route(projectId, "workflow", error.message));
  revalidatePath(`/projects/${projectId}`);
  redirect(route(projectId, "roles"));
}

export async function goToProjectSetupStepAction(formData: FormData) {
  await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  const nextStep = steps.parse(String(formData.get("nextStep") ?? "review"));
  let supabase;
  try { supabase = await requireSetupManager(projectId); }
  catch (error) { redirect(route(projectId, "workflow", error instanceof Error ? error.message : "Permission denied.")); }
  const { error } = await supabase.from("project_setup_preferences").update({ current_step: nextStep }).eq("project_id", projectId);
  if (error) redirect(route(projectId, nextStep, error.message));
  redirect(route(projectId, nextStep));
}

export async function completeProjectSetupAction(formData: FormData) {
  const user = await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  let supabase;
  try { supabase = await requireSetupManager(projectId); }
  catch (error) { redirect(route(projectId, "review", error instanceof Error ? error.message : "Permission denied.")); }
  const { error } = await supabase.from("project_setup_preferences").update({ setup_status: "complete", current_step: "review", completed_at: new Date().toISOString(), updated_by: user.id }).eq("project_id", projectId);
  if (error) redirect(route(projectId, "review", error.message));
  revalidatePath(`/projects/${projectId}/overview`);
  redirect(`/projects/${projectId}/overview?success=${encodeURIComponent("Initial project setup marked complete. The readiness checklist remains live as the production changes.")}`);
}
