import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

function createTheatreBudgetIntegrationClient() {
  return createSupabaseAdminClient();
}

export type TheatreBudgetGuestArtist = {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  vendor_number: string | null;
  active: boolean;
};

export type TheatreBudgetProject = {
  id: string;
  name: string;
  season: string | null;
  status: string;
};

export type TheatreBudgetDepartment = {
  id: string;
  name: string;
};

export async function fetchTheatreBudgetProjectDepartments(projectId: string): Promise<{
  data: TheatreBudgetDepartment[];
  error: string | null;
}> {
  const supabase = createTheatreBudgetIntegrationClient();
  const { data, error } = await supabase
    .schema("app_theatre_budget")
    .from("project_budget_lines")
    .select("production_category_id, production_categories(id, name)")
    .eq("project_id", projectId)
    .eq("active", true)
    .not("production_category_id", "is", null);
  if (error) return { data: [], error: error.message };
  const departments = new Map<string, string>();
  for (const row of data ?? []) {
    const relation = row.production_categories as unknown as { id?: string; name?: string } | Array<{ id?: string; name?: string }> | null;
    const department = Array.isArray(relation) ? relation[0] : relation;
    if (department?.id && department.name) departments.set(String(department.id), String(department.name));
  }
  return {
    data: [...departments].map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name)),
    error: null
  };
}

export type TheatreBudgetContractStatus = {
  id: string;
  project_id: string;
  guest_artist_id: string;
  workflow_status: "w9_requested" | "contract_sent" | "contract_signed_returned" | "siena_signed";
  updated_at: string;
};

export type TheatreBudgetContractSummary = TheatreBudgetContractStatus & {
  contract_number: string | null;
  contract_role: string | null;
  project_name: string;
  project_season: string | null;
};

export async function fetchTheatreBudgetContractSummaries(guestArtistIds: string[]): Promise<{
  data: TheatreBudgetContractSummary[];
  error: string | null;
}> {
  if (!guestArtistIds.length) return { data: [], error: null };
  const supabase = createTheatreBudgetIntegrationClient();
  const { data, error } = await supabase
    .schema("app_theatre_budget")
    .from("contracts")
    .select("id, project_id, guest_artist_id, contract_number, contract_role, workflow_status, updated_at, projects(name, season)")
    .in("guest_artist_id", guestArtistIds)
    .order("updated_at", { ascending: false });
  if (error) return { data: [], error: error.message };
  return {
    data: (data ?? []).map((row) => {
      const projectRelation = row.projects as unknown as { name?: string; season?: string | null } | Array<{ name?: string; season?: string | null }> | null;
      const project = Array.isArray(projectRelation) ? projectRelation[0] : projectRelation;
      return {
        id: String(row.id),
        project_id: String(row.project_id),
        guest_artist_id: String(row.guest_artist_id),
        contract_number: row.contract_number ? String(row.contract_number) : null,
        contract_role: row.contract_role ? String(row.contract_role) : null,
        workflow_status: row.workflow_status as TheatreBudgetContractStatus["workflow_status"],
        updated_at: String(row.updated_at),
        project_name: project?.name ? String(project.name) : "Unnamed Theatre Budget project",
        project_season: project?.season ? String(project.season) : null
      };
    }),
    error: null
  };
}

export async function fetchTheatreBudgetProjects(): Promise<{
  data: TheatreBudgetProject[];
  error: string | null;
}> {
  const supabase = createTheatreBudgetIntegrationClient();
  const { data, error } = await supabase
    .schema("app_theatre_budget")
    .from("projects")
    .select("id, name, season, status")
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as TheatreBudgetProject[], error: null };
}

export async function fetchTheatreBudgetProjectById(id: string) {
  const supabase = createTheatreBudgetIntegrationClient();
  const { data, error } = await supabase
    .schema("app_theatre_budget")
    .from("projects")
    .select("id, name, season, status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as TheatreBudgetProject | null;
}

export async function fetchTheatreBudgetContractStatuses(projectId: string): Promise<{
  data: TheatreBudgetContractStatus[];
  error: string | null;
}> {
  const supabase = createTheatreBudgetIntegrationClient();
  const { data, error } = await supabase
    .schema("app_theatre_budget")
    .rpc("production_management_contract_statuses", { target_project_id: projectId });

  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as TheatreBudgetContractStatus[], error: null };
}

export async function fetchTheatreBudgetGuestArtists(): Promise<{
  data: TheatreBudgetGuestArtist[];
  error: string | null;
}> {
  const supabase = createTheatreBudgetIntegrationClient();
  const { data, error } = await supabase
    .schema("app_theatre_budget")
    .from("guest_artists")
    .select("id, display_name, email, phone, vendor_number, active")
    .order("display_name", { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as TheatreBudgetGuestArtist[], error: null };
}

export async function fetchTheatreBudgetGuestArtistById(id: string) {
  const supabase = createTheatreBudgetIntegrationClient();
  const { data, error } = await supabase
    .schema("app_theatre_budget")
    .from("guest_artists")
    .select("id, display_name, email, phone, vendor_number, active")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as TheatreBudgetGuestArtist | null;
}

export async function findTheatreBudgetGuestArtist(input: { displayName: string; email?: string; vendorNumber?: string }) {
  const supabase = createTheatreBudgetIntegrationClient();
  let query = supabase
    .schema("app_theatre_budget")
    .from("guest_artists")
    .select("id, display_name, email, phone, vendor_number, active")
    .limit(1);
  if (input.vendorNumber) query = query.eq("vendor_number", input.vendorNumber);
  else if (input.email) query = query.ilike("email", input.email);
  else query = query.ilike("display_name", input.displayName);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data as TheatreBudgetGuestArtist | null;
}

export async function createTheatreBudgetGuestArtist(input: {
  displayName: string;
  email?: string;
  phone?: string;
  vendorNumber?: string;
}) {
  const supabase = createTheatreBudgetIntegrationClient();
  const { data, error } = await supabase
    .schema("app_theatre_budget")
    .from("guest_artists")
    .insert({
      display_name: input.displayName,
      email: input.email || null,
      phone: input.phone || null,
      vendor_number: input.vendorNumber || null,
      active: true,
      notes: "Created deliberately from Production Management; complete financial and contract details in Theatre Budget."
    })
    .select("id, display_name, email, phone, vendor_number, active")
    .single();
  if (error) throw new Error(error.message);
  return data as TheatreBudgetGuestArtist;
}
