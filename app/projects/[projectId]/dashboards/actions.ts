"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { defaultDashboardLayout, normalizeDashboardLayout } from "@/lib/dashboard-modules";

const uuid = z.string().uuid();
const nameSchema = z.string().trim().min(1, "Dashboard name is required.").max(80);

function route(projectId: string, type: "error" | "success", message: string, viewId?: string) {
  const params = new URLSearchParams({ [type]: message });
  if (viewId) params.set("viewId", viewId);
  return `/projects/${projectId}/dashboards?${params.toString()}`;
}

export async function createDashboardViewAction(formData: FormData) {
  const user = await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  const parsedName = nameSchema.safeParse(String(formData.get("name") ?? ""));
  if (!parsedName.success) redirect(route(projectId, "error", parsedName.error.issues[0]?.message ?? "Invalid dashboard name."));
  const visibility = String(formData.get("visibility") ?? "private") === "project" ? "project" : "private";
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase.from("project_dashboard_views").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("owner_user_id", user.id);
  const { data, error } = await supabase.from("project_dashboard_views").insert({
    project_id: projectId,
    owner_user_id: user.id,
    name: parsedName.data,
    visibility,
    is_default: Number(count ?? 0) === 0,
    layout: defaultDashboardLayout
  }).select("id").single();
  if (error) redirect(route(projectId, "error", error.message));
  revalidatePath(`/projects/${projectId}/dashboards`);
  redirect(route(projectId, "success", "Dashboard created.", String(data.id)));
}

export async function saveDashboardLayoutAction(projectId: string, viewId: string, formData: FormData) {
  const user = await requireUser();
  uuid.parse(projectId); uuid.parse(viewId);
  let raw: unknown;
  try { raw = JSON.parse(String(formData.get("layout") ?? "[]")); } catch { redirect(route(projectId, "error", "Invalid dashboard layout.", viewId)); }
  const layout = normalizeDashboardLayout(raw);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("project_dashboard_views").update({ layout }).eq("id", viewId).eq("project_id", projectId).eq("owner_user_id", user.id);
  if (error) redirect(route(projectId, "error", error.message, viewId));
  revalidatePath(`/projects/${projectId}/dashboards`);
  redirect(route(projectId, "success", "Dashboard layout saved.", viewId));
}

export async function updateDashboardDetailsAction(formData: FormData) {
  const user = await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  const viewId = uuid.parse(String(formData.get("viewId") ?? ""));
  const parsedName = nameSchema.safeParse(String(formData.get("name") ?? ""));
  if (!parsedName.success) redirect(route(projectId, "error", parsedName.error.issues[0]?.message ?? "Invalid dashboard name.", viewId));
  const visibility = String(formData.get("visibility") ?? "private") === "project" ? "project" : "private";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("project_dashboard_views").update({ name: parsedName.data, visibility }).eq("id", viewId).eq("project_id", projectId).eq("owner_user_id", user.id);
  if (error) redirect(route(projectId, "error", error.message, viewId));
  revalidatePath(`/projects/${projectId}/dashboards`);
  redirect(route(projectId, "success", "Dashboard settings saved.", viewId));
}

export async function setDefaultDashboardAction(formData: FormData) {
  const user = await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  const viewId = uuid.parse(String(formData.get("viewId") ?? ""));
  const supabase = await createSupabaseServerClient();
  const { error: clearError } = await supabase.from("project_dashboard_views").update({ is_default: false }).eq("project_id", projectId).eq("owner_user_id", user.id).eq("is_default", true);
  if (clearError) redirect(route(projectId, "error", clearError.message, viewId));
  const { error } = await supabase.from("project_dashboard_views").update({ is_default: true }).eq("id", viewId).eq("project_id", projectId).eq("owner_user_id", user.id);
  if (error) redirect(route(projectId, "error", error.message, viewId));
  revalidatePath(`/projects/${projectId}/dashboards`);
  redirect(route(projectId, "success", "Default dashboard updated.", viewId));
}

export async function deleteDashboardViewAction(formData: FormData) {
  const user = await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  const viewId = uuid.parse(String(formData.get("viewId") ?? ""));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("project_dashboard_views").delete().eq("id", viewId).eq("project_id", projectId).eq("owner_user_id", user.id);
  if (error) redirect(route(projectId, "error", error.message, viewId));
  revalidatePath(`/projects/${projectId}/dashboards`);
  redirect(route(projectId, "success", "Dashboard deleted."));
}
