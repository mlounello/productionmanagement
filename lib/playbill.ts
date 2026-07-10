import { createSupabaseServerClient } from "@/lib/supabase-server";

export type PlaybillShow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  is_published: boolean;
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
  "id, title, slug, status, is_published, start_date, end_date, venue, season_tag, program_id, programs(id, title, slug, theatre_name, show_dates)";

export type PlaybillPersonInput = {
  programId: string;
  fullName: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  pronouns: string;
  email: string;
  roleTitle: string;
  teamType: "cast" | "production";
};

export type PlaybillRoleInput = {
  showId: string;
  personId: string | null;
  roleName: string;
  category: "cast" | "creative" | "production";
};

export type PlaybillPerson = {
  id: string;
  program_id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  preferred_name: string;
  pronouns: string;
  email: string;
  role_title: string;
  team_type: string;
};

export type PlaybillShowRole = {
  id: string;
  show_id: string;
  person_id: string | null;
  role_name: string;
  category: string;
};

export type PlaybillSubmissionRequest = {
  id: string;
  show_role_id: string;
  request_type: string;
  status: string;
};

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

export async function fetchPlaybillPersonById(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("app_playbill")
    .from("people")
    .select("id, program_id, full_name, first_name, last_name, preferred_name, pronouns, email, role_title, team_type")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as PlaybillPerson | null;
}

export async function findPlaybillPerson(input: PlaybillPersonInput) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .schema("app_playbill")
    .from("people")
    .select("id, program_id, full_name, first_name, last_name, preferred_name, pronouns, email, role_title, team_type")
    .eq("program_id", input.programId)
    .limit(1);

  if (input.email) {
    query = query.ilike("email", input.email);
  } else {
    query = query.ilike("full_name", input.fullName);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as PlaybillPerson | null;
}

export async function createPlaybillPerson(input: PlaybillPersonInput) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("app_playbill")
    .from("people")
    .insert({
      program_id: input.programId,
      full_name: input.fullName,
      first_name: input.firstName,
      last_name: input.lastName,
      preferred_name: input.preferredName,
      pronouns: input.pronouns,
      email: input.email,
      role_title: input.roleTitle,
      team_type: input.teamType,
      bio: "",
      submission_status: "pending",
      submission_type: "bio"
    })
    .select("id, program_id, full_name, first_name, last_name, preferred_name, pronouns, email, role_title, team_type")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as PlaybillPerson;
}

export async function updatePlaybillPersonIdentity(id: string, input: PlaybillPersonInput) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("app_playbill")
    .from("people")
    .update({
      full_name: input.fullName,
      first_name: input.firstName,
      last_name: input.lastName,
      preferred_name: input.preferredName,
      pronouns: input.pronouns,
      email: input.email,
      team_type: input.teamType
    })
    .eq("id", id)
    .eq("program_id", input.programId)
    .select("id, program_id, full_name, first_name, last_name, preferred_name, pronouns, email, role_title, team_type")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as PlaybillPerson;
}

export async function fetchPlaybillShowRoleById(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("app_playbill")
    .from("show_roles")
    .select("id, show_id, person_id, role_name, category")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as PlaybillShowRole | null;
}

export async function findPlaybillShowRole(input: PlaybillRoleInput) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .schema("app_playbill")
    .from("show_roles")
    .select("id, show_id, person_id, role_name, category")
    .eq("show_id", input.showId)
    .eq("role_name", input.roleName)
    .eq("category", input.category)
    .limit(1);

  query = input.personId ? query.eq("person_id", input.personId) : query.is("person_id", null);
  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as PlaybillShowRole | null;
}

export async function createPlaybillShowRole(input: PlaybillRoleInput) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("app_playbill")
    .from("show_roles")
    .insert({
      show_id: input.showId,
      person_id: input.personId,
      role_name: input.roleName,
      category: input.category
    })
    .select("id, show_id, person_id, role_name, category")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as PlaybillShowRole;
}

export async function updatePlaybillShowRole(id: string, input: PlaybillRoleInput) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema("app_playbill")
    .from("show_roles")
    .update({
      show_id: input.showId,
      person_id: input.personId,
      role_name: input.roleName,
      category: input.category
    })
    .eq("id", id)
    .select("id, show_id, person_id, role_name, category")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as PlaybillShowRole;
}

export async function ensureBioSubmissionRequest(showRoleId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: existing, error: existingError } = await supabase
    .schema("app_playbill")
    .from("submission_requests")
    .select("id, show_role_id, request_type, status")
    .eq("show_role_id", showRoleId)
    .eq("request_type", "bio")
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    return existing as PlaybillSubmissionRequest;
  }

  const { data, error } = await supabase
    .schema("app_playbill")
    .from("submission_requests")
    .insert({
      show_role_id: showRoleId,
      request_type: "bio",
      label: "Bio",
      status: "draft"
    })
    .select("id, show_role_id, request_type, status")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as PlaybillSubmissionRequest;
}

export async function deletePlaybillSubmissionRequestsForRole(showRoleId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .schema("app_playbill")
    .from("submission_requests")
    .delete()
    .eq("show_role_id", showRoleId);
  if (error) throw new Error(error.message);
}
