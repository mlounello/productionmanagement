import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

function createPlaybillIntegrationClient() {
  return createSupabaseAdminClient();
}

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
  bio_intake_mode: "playbill_standalone" | "production_managed" | "hybrid";
  programs: {
    id: string;
    title: string;
    slug: string;
    theatre_name: string;
    show_dates: string;
  } | null;
};

const showSelect =
  "id, title, slug, status, is_published, start_date, end_date, venue, season_tag, program_id, bio_intake_mode, programs(id, title, slug, theatre_name, show_dates)";
const legacyShowSelect =
  "id, title, slug, status, is_published, start_date, end_date, venue, season_tag, program_id, programs(id, title, slug, theatre_name, show_dates)";

type PlaybillShowContractRow = Omit<PlaybillShow, "programs"> & {
  program_title: string | null;
  program_slug: string | null;
  theatre_name: string | null;
  show_dates: string | null;
};

function withDefaultIntakeMode<T extends Record<string, unknown>>(row: T) {
  return { ...row, bio_intake_mode: row.bio_intake_mode ?? "playbill_standalone" } as unknown as PlaybillShow;
}

function isMissingColumnError(error: { code?: string; message?: string } | null, columns: string[]) {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  return ["42703", "PGRST204"].includes(String(error.code ?? ""))
    && columns.some((column) => message.includes(column.toLowerCase()));
}

function isMissingReadContractError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return ["42883", "PGRST202"].includes(String(error.code ?? ""));
}

function showFromContract(row: PlaybillShowContractRow): PlaybillShow {
  const hasProgram = Boolean(row.program_id);
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    is_published: row.is_published,
    start_date: row.start_date,
    end_date: row.end_date,
    venue: row.venue,
    season_tag: row.season_tag,
    program_id: row.program_id,
    bio_intake_mode: row.bio_intake_mode ?? "playbill_standalone",
    programs: hasProgram ? {
      id: String(row.program_id),
      title: row.program_title ?? "",
      slug: row.program_slug ?? "",
      theatre_name: row.theatre_name ?? "",
      show_dates: row.show_dates ?? ""
    } : null
  };
}

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
  category: "cast" | "creative" | "production" | "band";
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
  const supabase = createPlaybillIntegrationClient();
  const contract = await supabase
    .schema("app_playbill")
    .rpc("production_management_shows", { p_show_id: null });

  if (!contract.error) {
    return {
      data: ((contract.data ?? []) as PlaybillShowContractRow[]).map(showFromContract),
      error: null
    };
  }
  if (!isMissingReadContractError(contract.error)) {
    return { data: [], error: `Playbill server authorization failed: ${contract.error.message}` };
  }

  const { data, error } = await supabase
    .schema("app_playbill")
    .from("shows")
    .select(showSelect)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("title", { ascending: true });

  if (error) {
    if (!isMissingColumnError(error, ["bio_intake_mode"])) return { data: [], error: error.message };
    const { data: legacyData, error: legacyError } = await supabase
      .schema("app_playbill")
      .from("shows")
      .select(legacyShowSelect)
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("title", { ascending: true });
    if (legacyError) return { data: [], error: error.message };
    return { data: (legacyData ?? []).map((row) => withDefaultIntakeMode(row as Record<string, unknown>)), error: null };
  }

  return { data: (data ?? []) as unknown as PlaybillShow[], error: null };
}

export async function fetchPlaybillShowById(id: string) {
  const supabase = createPlaybillIntegrationClient();
  const contract = await supabase
    .schema("app_playbill")
    .rpc("production_management_shows", { p_show_id: id });
  if (!contract.error) {
    const row = ((contract.data ?? []) as PlaybillShowContractRow[])[0];
    return row ? showFromContract(row) : null;
  }
  if (!isMissingReadContractError(contract.error)) {
    throw new Error(`Playbill server authorization failed: ${contract.error.message}`);
  }

  const { data, error } = await supabase
    .schema("app_playbill")
    .from("shows")
    .select(showSelect)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (!isMissingColumnError(error, ["bio_intake_mode"])) throw new Error(error.message);
    const { data: legacyData, error: legacyError } = await supabase
      .schema("app_playbill")
      .from("shows")
      .select(legacyShowSelect)
      .eq("id", id)
      .maybeSingle();
    if (legacyError) throw new Error(error.message);
    return legacyData ? withDefaultIntakeMode(legacyData as Record<string, unknown>) : null;
  }

  return data as unknown as PlaybillShow | null;
}

export async function fetchPlaybillPersonById(id: string) {
  const supabase = createPlaybillIntegrationClient();
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
  const supabase = createPlaybillIntegrationClient();
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
  const supabase = createPlaybillIntegrationClient();
  const baseRow = {
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
  };
  let { data, error } = await supabase
    .schema("app_playbill")
    .from("people")
    .insert({
      ...baseRow,
      submission_source: "production_management"
    })
    .select("id, program_id, full_name, first_name, last_name, preferred_name, pronouns, email, role_title, team_type")
    .single();

  if (error) {
    if (!isMissingColumnError(error, ["submission_source"])) throw new Error(error.message);
    const legacy = await supabase.schema("app_playbill").from("people").insert(baseRow)
      .select("id, program_id, full_name, first_name, last_name, preferred_name, pronouns, email, role_title, team_type").single();
    data = legacy.data;
    error = legacy.error;
    if (error) throw new Error(error.message);
  }

  return data as PlaybillPerson;
}

export async function updatePlaybillPersonIdentity(id: string, input: PlaybillPersonInput) {
  const supabase = createPlaybillIntegrationClient();
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

  if (error) throw new Error(error.message);

  return data as PlaybillPerson;
}

export async function fetchPlaybillShowRoleById(id: string) {
  const supabase = createPlaybillIntegrationClient();
  const contract = await supabase
    .schema("app_playbill")
    .rpc("production_management_show_roles", { p_show_id: null, p_role_id: id });
  if (!contract.error) {
    return (((contract.data ?? []) as PlaybillShowRole[])[0] ?? null);
  }
  if (!isMissingReadContractError(contract.error)) {
    throw new Error(`Playbill server authorization failed: ${contract.error.message}`);
  }

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

export async function fetchPlaybillShowRoles(showId: string) {
  const supabase = createPlaybillIntegrationClient();
  const contract = await supabase
    .schema("app_playbill")
    .rpc("production_management_show_roles", { p_show_id: showId, p_role_id: null });
  if (!contract.error) return (contract.data ?? []) as PlaybillShowRole[];
  if (!isMissingReadContractError(contract.error)) {
    throw new Error(`Playbill server authorization failed: ${contract.error.message}`);
  }

  const { data, error } = await supabase
    .schema("app_playbill")
    .from("show_roles")
    .select("id, show_id, person_id, role_name, category")
    .eq("show_id", showId)
    .order("category", { ascending: true })
    .order("role_name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PlaybillShowRole[];
}

export async function findPlaybillShowRole(input: PlaybillRoleInput) {
  const contractRoles = await fetchPlaybillShowRoles(input.showId);
  return contractRoles.find((role) =>
    role.role_name === input.roleName
      && role.category === input.category
      && (role.person_id ?? null) === (input.personId ?? null)
  ) ?? null;
}

export async function createPlaybillShowRole(input: PlaybillRoleInput) {
  const supabase = createPlaybillIntegrationClient();
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
  const supabase = createPlaybillIntegrationClient();
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

  if (error) throw new Error(error.message);

  return data as PlaybillShowRole;
}

export async function ensureBioSubmissionRequest(showRoleId: string) {
  const supabase = createPlaybillIntegrationClient();
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

  let { data, error } = await supabase
    .schema("app_playbill")
    .from("submission_requests")
    .insert({
      show_role_id: showRoleId,
      request_type: "bio",
      label: "Bio",
      status: "draft",
      submission_source: "production_management"
    })
    .select("id, show_role_id, request_type, status")
    .single();

  if (error) {
    if (!isMissingColumnError(error, ["submission_source"])) throw new Error(error.message);
    const legacy = await supabase.schema("app_playbill").from("submission_requests").insert({
      show_role_id: showRoleId,
      request_type: "bio",
      label: "Bio",
      status: "draft"
    }).select("id, show_role_id, request_type, status").single();
    data = legacy.data;
    error = legacy.error;
    if (error) throw new Error(error.message);
  }

  return data as PlaybillSubmissionRequest;
}

export async function markBioSubmissionRequestSource(showRoleId: string, source: "playbill" | "production_management") {
  const supabase = createPlaybillIntegrationClient();
  const { data, error } = await supabase
    .schema("app_playbill")
    .from("submission_requests")
    .update({ submission_source: source })
    .eq("show_role_id", showRoleId)
    .eq("request_type", "bio")
    .select("id, show_role_id, request_type, status")
    .single();
  if (error) {
    if (!isMissingColumnError(error, ["submission_source"])) throw new Error(error.message);
    return ensureBioSubmissionRequest(showRoleId);
  }
  return data as PlaybillSubmissionRequest;
}

export async function updatePlaybillPersonPublicity(input: {
  personId: string;
  productionManagementPersonId: string;
  productionManagementApprovalId: string;
  profileVersion: number;
  creditedName: string;
  bio: string;
  headshotUrl: string;
}) {
  const supabase = createPlaybillIntegrationClient();
  const submittedAt = new Date().toISOString();
  let { data, error } = await supabase
    .schema("app_playbill")
    .from("people")
    .update({
      full_name: input.creditedName,
      bio: input.bio,
      headshot_url: input.headshotUrl,
      submission_status: "submitted",
      submitted_at: submittedAt,
      submission_source: "production_management",
      production_management_person_id: input.productionManagementPersonId,
      production_management_approval_id: input.productionManagementApprovalId,
      source_profile_version: input.profileVersion
    })
    .eq("id", input.personId)
    .select("id")
    .single();
  if (error) {
    if (!isMissingColumnError(error, ["submission_source", "production_management_person_id", "production_management_approval_id", "source_profile_version"])) throw new Error(error.message);
    const legacy = await supabase.schema("app_playbill").from("people").update({
      full_name: input.creditedName,
      bio: input.bio,
      headshot_url: input.headshotUrl,
      submission_status: "submitted",
      submitted_at: submittedAt
    }).eq("id", input.personId).select("id").single();
    data = legacy.data;
    error = legacy.error;
    if (error) throw new Error(error.message);
  }
  return data;
}

export async function markPlaybillBioRequestSubmitted(requestId: string) {
  const supabase = createPlaybillIntegrationClient();
  let { error } = await supabase
    .schema("app_playbill")
    .from("submission_requests")
    .update({ status: "submitted", submission_source: "production_management" })
    .eq("id", requestId);
  if (error) {
    if (!isMissingColumnError(error, ["submission_source"])) throw new Error(error.message);
    const legacy = await supabase.schema("app_playbill").from("submission_requests").update({ status: "submitted" }).eq("id", requestId);
    error = legacy.error;
    if (error) throw new Error(error.message);
  }
}

export async function deletePlaybillSubmissionRequestsForRole(showRoleId: string) {
  const supabase = createPlaybillIntegrationClient();
  const { error } = await supabase
    .schema("app_playbill")
    .from("submission_requests")
    .delete()
    .eq("show_role_id", showRoleId);
  if (error) throw new Error(error.message);
}
