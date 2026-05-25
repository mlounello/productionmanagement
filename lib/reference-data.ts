import { createSupabaseServerClient } from "@/lib/supabase-server";

export type DepartmentOption = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
};

export type LocationOption = {
  id: string;
  name: string;
  slug: string;
  building: string;
  room: string;
  location_type: string;
  is_active: boolean;
};

export type ReferenceValueOption = {
  id: string;
  reference_type: string;
  label: string;
  slug: string;
  is_active: boolean;
};

export type ReferenceType = "project_type" | "calendar_item_type" | "role_group";

export function slugifyReferenceValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 90);
}

export async function fetchActiveDepartments() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id, name, slug, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DepartmentOption[];
}

export async function fetchActiveLocations() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, slug, building, room, location_type, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as LocationOption[];
}

export async function fetchActiveReferenceValues(referenceType: ReferenceType) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("reference_values")
    .select("id, reference_type, label, slug, is_active")
    .eq("reference_type", referenceType)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ReferenceValueOption[];
}

export async function fetchReferenceDataOverview() {
  const supabase = await createSupabaseServerClient();
  const [departments, locations, referenceValues] = await Promise.all([
    supabase
      .from("departments")
      .select("id, name, slug, is_active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("locations")
      .select("id, name, slug, building, room, location_type, is_active")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("reference_values")
      .select("id, reference_type, label, slug, is_active")
      .order("reference_type", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true })
  ]);

  const error = departments.error ?? locations.error ?? referenceValues.error;
  if (error) {
    throw new Error(error.message);
  }

  return {
    departments: (departments.data ?? []) as DepartmentOption[],
    locations: (locations.data ?? []) as LocationOption[],
    referenceValues: (referenceValues.data ?? []) as ReferenceValueOption[]
  };
}

export async function createDepartment(name: string) {
  const trimmedName = name.trim();
  const slug = slugifyReferenceValue(trimmedName);

  if (!trimmedName || !slug) {
    throw new Error("Department name is required.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("departments").insert({ name: trimmedName, slug });

  if (error) {
    throw new Error(error.message);
  }
}

export async function createLocation(name: string) {
  const trimmedName = name.trim();
  const slug = slugifyReferenceValue(trimmedName);

  if (!trimmedName || !slug) {
    throw new Error("Location name is required.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("locations").insert({ name: trimmedName, slug });

  if (error) {
    throw new Error(error.message);
  }
}

export async function createReferenceValue(referenceType: ReferenceType, label: string) {
  const trimmedLabel = label.trim();
  const slug = slugifyReferenceValue(trimmedLabel).replace(/-/g, "_");

  if (!trimmedLabel || !slug) {
    throw new Error("Reference value label is required.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("reference_values").insert({
    reference_type: referenceType,
    label: trimmedLabel,
    slug
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function archiveReferenceRecord(kind: "department" | "location" | "reference_value", id: string) {
  const table = kind === "department" ? "departments" : kind === "location" ? "locations" : "reference_values";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from(table).update({ is_active: false }).eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}
