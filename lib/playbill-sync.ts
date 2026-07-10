import { ENABLE_PLAYBILL_WRITES } from "@/lib/config";
import {
  createPlaybillPerson,
  createPlaybillShowRole,
  deletePlaybillSubmissionRequestsForRole,
  ensureBioSubmissionRequest,
  fetchPlaybillPersonById,
  fetchPlaybillShowById,
  fetchPlaybillShowRoleById,
  findPlaybillPerson,
  findPlaybillShowRole,
  updatePlaybillPersonIdentity,
  updatePlaybillShowRole,
  type PlaybillPerson,
  type PlaybillShow,
  type PlaybillShowRole
} from "@/lib/playbill";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type PmClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function categoryForRoleGroup(roleGroup: string): "cast" | "creative" | "production" | "band" {
  if (roleGroup === "cast") return "cast";
  if (roleGroup === "music_band") return "band";
  if (["creative_team", "directorial_team", "administrative"].includes(roleGroup)) return "creative";
  return "production";
}

function teamTypeForRoleGroup(roleGroup: string): "cast" | "production" {
  return roleGroup === "cast" ? "cast" : "production";
}

async function replaceExternalLink(
  supabase: PmClient,
  link: {
    local_entity_type: string;
    local_entity_id: string;
    external_table: string;
    external_id: string;
    metadata: Record<string, unknown>;
  }
) {
  const match = {
    local_entity_type: link.local_entity_type,
    local_entity_id: link.local_entity_id,
    external_app: "playbill",
    external_schema: "app_playbill",
    external_table: link.external_table
  };
  const { error: deleteError } = await supabase.from("external_links").delete().match(match);
  if (deleteError) throw new Error(deleteError.message);

  const { error } = await supabase.from("external_links").insert({
    ...match,
    external_id: link.external_id,
    sync_direction: "push",
    sync_status: "synced",
    metadata: link.metadata
  });
  if (error) throw new Error(error.message);
}

async function getLinkedDraftShow(supabase: PmClient, projectId: string): Promise<PlaybillShow | null> {
  const { data: projectLink, error } = await supabase
    .from("external_links")
    .select("external_id")
    .eq("local_entity_type", "project")
    .eq("local_entity_id", projectId)
    .eq("external_app", "playbill")
    .eq("external_schema", "app_playbill")
    .eq("external_table", "shows")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!projectLink?.external_id) return null;

  const show = await fetchPlaybillShowById(String(projectLink.external_id));
  if (!show) throw new Error("The linked Playbill show was not found.");
  if (show.is_published || show.status !== "draft") return null;
  if (!show.program_id) throw new Error("The linked Playbill show does not have a program_id yet.");
  return show;
}

async function getProjectRole(supabase: PmClient, projectId: string, roleId: string) {
  const { data, error } = await supabase
    .from("project_roles")
    .select("id, name, role_group")
    .eq("project_id", projectId)
    .eq("id", roleId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Project role not found.");
  return data;
}

async function linkedShowRoleForProjectRole(supabase: PmClient, roleId: string) {
  const { data, error } = await supabase
    .from("external_links")
    .select("external_id")
    .eq("local_entity_type", "project_role")
    .eq("local_entity_id", roleId)
    .eq("external_app", "playbill")
    .eq("external_schema", "app_playbill")
    .eq("external_table", "show_roles")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.external_id ? fetchPlaybillShowRoleById(String(data.external_id)) : null;
}

async function linkedShowRoleFromExistingAssignment(supabase: PmClient, projectId: string, roleId: string) {
  const { data: assignments, error: assignmentsError } = await supabase
    .from("role_assignments")
    .select("id")
    .eq("project_id", projectId)
    .eq("role_id", roleId);
  if (assignmentsError) throw new Error(assignmentsError.message);
  const ids = (assignments ?? []).map((row) => String(row.id));
  if (ids.length === 0) return null;
  const { data: link, error } = await supabase
    .from("external_links")
    .select("external_id")
    .eq("local_entity_type", "role_assignment")
    .eq("external_app", "playbill")
    .eq("external_schema", "app_playbill")
    .eq("external_table", "show_roles")
    .in("local_entity_id", ids)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return link?.external_id ? fetchPlaybillShowRoleById(String(link.external_id)) : null;
}

export async function syncProjectRoleToPlaybill(projectId: string, roleId: string) {
  if (!ENABLE_PLAYBILL_WRITES) return null;
  const supabase = await createSupabaseServerClient();
  const show = await getLinkedDraftShow(supabase, projectId);
  if (!show) return null;
  const role = await getProjectRole(supabase, projectId, roleId);
  const input = {
    showId: show.id,
    personId: null,
    roleName: String(role.name),
    category: categoryForRoleGroup(String(role.role_group))
  };

  let showRole = await linkedShowRoleForProjectRole(supabase, roleId);
  if (!showRole) showRole = await linkedShowRoleFromExistingAssignment(supabase, projectId, roleId);
  if (showRole) {
    showRole = await updatePlaybillShowRole(showRole.id, { ...input, personId: showRole.person_id });
  } else {
    showRole = await findPlaybillShowRole(input);
    if (!showRole) showRole = await createPlaybillShowRole(input);
  }

  await replaceExternalLink(supabase, {
    local_entity_type: "project_role",
    local_entity_id: roleId,
    external_table: "show_roles",
    external_id: showRole.id,
    metadata: {
      show_id: show.id,
      program_id: show.program_id,
      role_name: showRole.role_name,
      category: showRole.category,
      vacant: !showRole.person_id
    }
  });
  const { error: roleStatusError } = await supabase
    .from("project_roles")
    .update({ playbill_sync_status: "synced", sync_notes: "" })
    .eq("project_id", projectId)
    .eq("id", roleId);
  if (roleStatusError) throw new Error(roleStatusError.message);
  return { show, role, showRole };
}

export async function markProjectRolePlaybillSyncFailed(projectId: string, roleId: string, error: unknown) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("project_roles")
    .update({ playbill_sync_status: "failed", sync_notes: error instanceof Error ? error.message : "Playbill sync failed." })
    .eq("project_id", projectId)
    .eq("id", roleId);
}

export async function syncAssignmentToPlaybill(projectId: string, assignmentId: string) {
  if (!ENABLE_PLAYBILL_WRITES) return null;
  const supabase = await createSupabaseServerClient();
  const show = await getLinkedDraftShow(supabase, projectId);
  if (!show) return null;

  const { data: assignment, error: assignmentError } = await supabase
    .from("role_assignments")
    .select("id, role_id, person_id, assignment_kind")
    .eq("project_id", projectId)
    .eq("id", assignmentId)
    .maybeSingle();
  if (assignmentError) throw new Error(assignmentError.message);
  if (!assignment) throw new Error("Role assignment not found.");

  const role = await getProjectRole(supabase, projectId, String(assignment.role_id));
  const assignmentKind = String(assignment.assignment_kind ?? "primary");
  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id, full_name, first_name, last_name, preferred_name, pronouns, email")
    .eq("id", String(assignment.person_id))
    .maybeSingle();
  if (personError) throw new Error(personError.message);
  if (!person) throw new Error("Assigned person not found.");

  const personInput = {
    programId: String(show.program_id),
    fullName: String(person.full_name),
    firstName: String(person.first_name ?? ""),
    lastName: String(person.last_name ?? ""),
    preferredName: String(person.preferred_name ?? ""),
    pronouns: String(person.pronouns ?? ""),
    email: String(person.email ?? ""),
    roleTitle: String(role.name),
    teamType: teamTypeForRoleGroup(String(role.role_group))
  };

  const { data: personLinks, error: personLinksError } = await supabase
    .from("external_links")
    .select("external_id, metadata")
    .eq("local_entity_type", "person")
    .eq("local_entity_id", String(person.id))
    .eq("external_app", "playbill")
    .eq("external_schema", "app_playbill")
    .eq("external_table", "people");
  if (personLinksError) throw new Error(personLinksError.message);

  let playbillPerson: PlaybillPerson | null = null;
  for (const link of personLinks ?? []) {
    if ((link.metadata as Record<string, unknown> | null)?.program_id === show.program_id) {
      playbillPerson = await fetchPlaybillPersonById(String(link.external_id));
      break;
    }
  }
  if (playbillPerson) {
    playbillPerson = await updatePlaybillPersonIdentity(playbillPerson.id, personInput);
  } else {
    playbillPerson = await findPlaybillPerson(personInput);
    playbillPerson = playbillPerson
      ? await updatePlaybillPersonIdentity(playbillPerson.id, personInput)
      : await createPlaybillPerson(personInput);
  }

  const { error: personLinkError } = await supabase.from("external_links").upsert({
    local_entity_type: "person",
    local_entity_id: String(person.id),
    external_app: "playbill",
    external_schema: "app_playbill",
    external_table: "people",
    external_id: playbillPerson.id,
    sync_direction: "push",
    sync_status: "synced",
    metadata: { program_id: show.program_id, show_id: show.id, source: "production_management" }
  }, {
    onConflict: "local_entity_type,local_entity_id,external_app,external_schema,external_table,external_id"
  });
  if (personLinkError) throw new Error(personLinkError.message);

  const projectRoleSlot = await linkedShowRoleForProjectRole(supabase, String(role.id));
  let showRole: PlaybillShowRole | null = null;
  const { data: assignmentRoleLink, error: assignmentRoleLinkError } = await supabase
    .from("external_links")
    .select("external_id")
    .eq("local_entity_type", "role_assignment")
    .eq("local_entity_id", assignmentId)
    .eq("external_app", "playbill")
    .eq("external_schema", "app_playbill")
    .eq("external_table", "show_roles")
    .maybeSingle();
  if (assignmentRoleLinkError) throw new Error(assignmentRoleLinkError.message);
  if (assignmentRoleLink?.external_id) showRole = await fetchPlaybillShowRoleById(String(assignmentRoleLink.external_id));
  if (!showRole && (assignmentKind === "primary" || assignmentKind === "shared")) showRole = projectRoleSlot;

  const roleName = assignmentKind === "understudy"
    ? `${String(role.name)} (Understudy)`
    : assignmentKind === "alternate"
      ? `${String(role.name)} (Alternate)`
      : String(role.name);

  const roleInput = {
    showId: show.id,
    personId: playbillPerson.id,
    roleName,
    category: categoryForRoleGroup(String(role.role_group))
  };
  if (showRole && (!showRole.person_id || showRole.person_id === playbillPerson.id)) {
    showRole = await updatePlaybillShowRole(showRole.id, roleInput);
  } else {
    showRole = await findPlaybillShowRole(roleInput);
    showRole = showRole ? await updatePlaybillShowRole(showRole.id, roleInput) : await createPlaybillShowRole(roleInput);
  }

  if (!projectRoleSlot || projectRoleSlot.id === showRole.id) {
    await replaceExternalLink(supabase, {
      local_entity_type: "project_role",
      local_entity_id: String(role.id),
      external_table: "show_roles",
      external_id: showRole.id,
      metadata: { show_id: show.id, program_id: show.program_id, role_name: showRole.role_name, category: showRole.category, vacant: false }
    });
  }
  await replaceExternalLink(supabase, {
    local_entity_type: "role_assignment",
    local_entity_id: assignmentId,
    external_table: "show_roles",
    external_id: showRole.id,
    metadata: { show_id: show.id, program_id: show.program_id, person_id: playbillPerson.id, role_name: showRole.role_name, category: showRole.category }
  });

  const request = await ensureBioSubmissionRequest(showRole.id);
  await replaceExternalLink(supabase, {
    local_entity_type: "role_assignment",
    local_entity_id: assignmentId,
    external_table: "submission_requests",
    external_id: request.id,
    metadata: { show_id: show.id, program_id: show.program_id, show_role_id: showRole.id, request_type: request.request_type, status: request.status }
  });
  const { error: updateError } = await supabase
    .from("role_assignments")
    .update({ playbill_sync_status: "synced", sync_notes: "" })
    .eq("project_id", projectId)
    .eq("id", assignmentId);
  if (updateError) throw new Error(updateError.message);
  return { show, role, person, showRole, playbillPerson, request };
}

export async function markAssignmentPlaybillSyncFailed(projectId: string, assignmentId: string, error: unknown) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("role_assignments")
    .update({ playbill_sync_status: "failed", sync_notes: error instanceof Error ? error.message : "Playbill sync failed." })
    .eq("project_id", projectId)
    .eq("id", assignmentId);
}

export async function vacateAssignmentInPlaybill(projectId: string, assignmentId: string, preserveAssignmentRoleLink = false) {
  if (!ENABLE_PLAYBILL_WRITES) return;
  const supabase = await createSupabaseServerClient();
  const show = await getLinkedDraftShow(supabase, projectId);
  if (!show) return;
  const { data: assignment, error: assignmentError } = await supabase
    .from("role_assignments")
    .select("role_id")
    .eq("project_id", projectId)
    .eq("id", assignmentId)
    .maybeSingle();
  if (assignmentError) throw new Error(assignmentError.message);
  const { data: link, error } = await supabase
    .from("external_links")
    .select("external_id")
    .eq("local_entity_type", "role_assignment")
    .eq("local_entity_id", assignmentId)
    .eq("external_app", "playbill")
    .eq("external_schema", "app_playbill")
    .eq("external_table", "show_roles")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!link?.external_id) return;
  const showRole = await fetchPlaybillShowRoleById(String(link.external_id));
  if (showRole) {
    await deletePlaybillSubmissionRequestsForRole(showRole.id);
    await updatePlaybillShowRole(showRole.id, {
      showId: show.id,
      personId: null,
      roleName: showRole.role_name,
      category: showRole.category as "cast" | "creative" | "production"
    });
  }
  const { error: deleteError } = await supabase
    .from("external_links")
    .delete()
    .eq("local_entity_type", "role_assignment")
    .eq("local_entity_id", assignmentId)
    .eq("external_app", "playbill")
    .neq("external_table", preserveAssignmentRoleLink ? "show_roles" : "__keep_none__");
  if (deleteError) throw new Error(deleteError.message);
  if (assignment?.role_id) await syncProjectRoleToPlaybill(projectId, String(assignment.role_id));
}

export async function syncPersonAssignmentsToPlaybill(personId: string) {
  if (!ENABLE_PLAYBILL_WRITES) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("role_assignments").select("id, project_id").eq("person_id", personId);
  if (error) throw new Error(error.message);
  const results = [];
  for (const assignment of data ?? []) {
    try {
      results.push(await syncAssignmentToPlaybill(String(assignment.project_id), String(assignment.id)));
    } catch (syncError) {
      await markAssignmentPlaybillSyncFailed(String(assignment.project_id), String(assignment.id), syncError);
      throw syncError;
    }
  }
  return results;
}
