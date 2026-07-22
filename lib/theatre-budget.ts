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

export type TheatreBudgetCategory = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
};

export async function fetchTheatreBudgetCategories(): Promise<{
  data: TheatreBudgetCategory[];
  error: string | null;
}> {
  const supabase = createTheatreBudgetIntegrationClient();
  const { data, error } = await supabase
    .schema("app_theatre_budget")
    .from("production_categories")
    .select("id, name, sort_order, active")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as TheatreBudgetCategory[], error: null };
}

export async function reconcileRoleAssignmentBudgetAccess(assignmentId: string) {
  const supabase = createTheatreBudgetIntegrationClient();
  const { data, error } = await supabase
    .schema("app_production_management")
    .rpc("reconcile_role_assignment_budget_access", { target_assignment_id: assignmentId });
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
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
