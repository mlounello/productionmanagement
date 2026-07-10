import { createSupabaseServerClient } from "@/lib/supabase-server";

export type TheatreBudgetGuestArtist = {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  vendor_number: string | null;
  active: boolean;
};

export async function fetchTheatreBudgetGuestArtists(): Promise<{
  data: TheatreBudgetGuestArtist[];
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();
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
  const supabase = await createSupabaseServerClient();
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
