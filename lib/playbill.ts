import { createSupabaseServerClient } from "@/lib/supabase-server";

export type PlaybillShow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  venue: string;
  season_tag: string;
  program_id: string | null;
  programs: {
    id: string;
    title: string;
    slug: string;
    theatre_name: string;
    show_dates: string;
  } | null;
};

const showSelect =
  "id, title, slug, status, start_date, end_date, venue, season_tag, program_id, programs(id, title, slug, theatre_name, show_dates)";

export async function fetchPlaybillShows(): Promise<{
  data: PlaybillShow[];
  error: string | null;
}> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("app_playbill")
    .from("shows")
    .select(showSelect)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("title", { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: (data ?? []) as unknown as PlaybillShow[], error: null };
}

export async function fetchPlaybillShowById(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("app_playbill")
    .from("shows")
    .select(showSelect)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as PlaybillShow | null;
}
