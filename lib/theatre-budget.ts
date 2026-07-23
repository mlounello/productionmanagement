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

function isMissingGuestArtistContractError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return ["42883", "PGRST202"].includes(String(error.code ?? ""));
}

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
  const contract = await supabase
    .schema("app_theatre_budget")
    .rpc("production_management_guest_artists", { p_guest_artist_id: null });
  if (!contract.error) {
    return { data: (contract.data ?? []) as TheatreBudgetGuestArtist[], error: null };
  }
  if (!isMissingGuestArtistContractError(contract.error)) {
    return { data: [], error: `Theatre Budget server authorization failed: ${contract.error.message}` };
  }

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
  const contract = await supabase
    .schema("app_theatre_budget")
    .rpc("production_management_guest_artists", { p_guest_artist_id: id });
  if (!contract.error) {
    return ((contract.data ?? []) as TheatreBudgetGuestArtist[])[0] ?? null;
  }
  if (!isMissingGuestArtistContractError(contract.error)) {
    throw new Error(`Theatre Budget server authorization failed: ${contract.error.message}`);
  }

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
  const result = await fetchTheatreBudgetGuestArtists();
  if (result.error) throw new Error(result.error);
  const vendorNumber = input.vendorNumber?.trim();
  const email = input.email?.trim().toLowerCase();
  const displayName = input.displayName.trim().toLowerCase();
  return result.data.find((guestArtist) => {
    if (vendorNumber) return guestArtist.vendor_number?.trim() === vendorNumber;
    if (email) return guestArtist.email?.trim().toLowerCase() === email;
    return guestArtist.display_name.trim().toLowerCase() === displayName;
  }) ?? null;
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
    .rpc("production_management_create_guest_artist", {
      p_display_name: input.displayName,
      p_email: input.email || null,
      p_phone: input.phone || null,
      p_vendor_number: input.vendorNumber || null
    });
  if (error) throw new Error(error.message);
  const created = ((data ?? []) as TheatreBudgetGuestArtist[])[0];
  if (!created) throw new Error("Theatre Budget guest artist creation returned no record.");
  return created;
}
