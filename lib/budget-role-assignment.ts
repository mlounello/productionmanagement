import { markAssignmentPlaybillSyncFailed, syncAssignmentToPlaybill } from "@/lib/playbill-sync";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { fetchTheatreBudgetGuestArtistById } from "@/lib/theatre-budget";

export type BudgetRoleAssignmentInput = {
  projectId: string;
  roleId: string;
  guestArtistId: string;
  assignmentKind: "primary" | "shared" | "understudy" | "alternate";
};

async function replaceBudgetLink(
  localEntityType: "person" | "role_assignment",
  localEntityId: string,
  guestArtist: { id: string; display_name: string; email: string | null; active: boolean },
  source: string
) {
  const supabase = await createSupabaseServerClient();
  const match = {
    local_entity_type: localEntityType,
    local_entity_id: localEntityId,
    external_app: "theatre_budget",
    external_schema: "app_theatre_budget",
    external_table: "guest_artists"
  };
  const { error: deleteError } = await supabase.from("external_links").delete().match(match);
  if (deleteError) throw new Error(deleteError.message);
  const { error } = await supabase.from("external_links").insert({
    ...match,
    external_id: guestArtist.id,
    sync_direction: "read_only",
    sync_status: "linked",
    metadata: {
      display_name: guestArtist.display_name,
      email: guestArtist.email,
      active: guestArtist.active,
      linked_from: source
    }
  });
  if (error) throw new Error(error.message);
}

export async function assignExistingBudgetGuestArtistToRole(input: BudgetRoleAssignmentInput) {
  const supabase = await createSupabaseServerClient();
  const { data: existingRoleAssignments, error: roleAvailabilityError } = await supabase
    .from("role_assignments")
    .select("id, status")
    .eq("project_id", input.projectId)
    .eq("role_id", input.roleId);
  if (roleAvailabilityError) throw new Error(roleAvailabilityError.message);
  if ((existingRoleAssignments ?? []).some((assignment) => !["declined", "withdrawn"].includes(String(assignment.status)))) {
    throw new Error("That role is already filled. Choose another role.");
  }
  const guestArtist = await fetchTheatreBudgetGuestArtistById(input.guestArtistId);
  if (!guestArtist) throw new Error("The Theatre Budget guest artist was not found.");

  const { data: existingPersonLink, error: personLinkLookupError } = await supabase
    .from("external_links")
    .select("local_entity_id")
    .eq("local_entity_type", "person")
    .eq("external_app", "theatre_budget")
    .eq("external_schema", "app_theatre_budget")
    .eq("external_table", "guest_artists")
    .eq("external_id", guestArtist.id)
    .limit(1)
    .maybeSingle();
  if (personLinkLookupError) throw new Error(personLinkLookupError.message);

  let personId = existingPersonLink?.local_entity_id ? String(existingPersonLink.local_entity_id) : "";
  if (personId) {
    const { data: linkedPerson } = await supabase.from("people").select("id").eq("id", personId).maybeSingle();
    if (!linkedPerson) personId = "";
  }
  if (!personId) {
    let personQuery = supabase.from("people").select("id").limit(1);
    if (guestArtist.vendor_number) personQuery = personQuery.eq("vendor_number", guestArtist.vendor_number);
    else if (guestArtist.email) personQuery = personQuery.ilike("email", guestArtist.email);
    else personQuery = personQuery.ilike("full_name", guestArtist.display_name);
    const { data: matchedPerson, error } = await personQuery.maybeSingle();
    if (error) throw new Error(error.message);
    personId = matchedPerson?.id ? String(matchedPerson.id) : "";
  }
  if (!personId) {
    const parts = guestArtist.display_name.trim().split(/\s+/);
    const { data: createdPerson, error } = await supabase
      .from("people")
      .insert({
        full_name: guestArtist.display_name,
        first_name: parts.length > 1 ? parts[0] : "",
        last_name: parts.length > 1 ? parts.slice(1).join(" ") : parts[0] ?? "",
        email: guestArtist.email ?? "",
        phone: guestArtist.phone ?? "",
        vendor_number: guestArtist.vendor_number ?? "",
        person_type: "guest_artist",
        affiliation: "Theatre Budget guest artist"
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    personId = String(createdPerson.id);
  }

  await replaceBudgetLink("person", personId, guestArtist, "theatre_budget_assignment_picker");
  const { data: existingAssignment, error: assignmentLookupError } = await supabase
    .from("role_assignments")
    .select("id")
    .eq("project_id", input.projectId)
    .eq("role_id", input.roleId)
    .eq("person_id", personId)
    .maybeSingle();
  if (assignmentLookupError) throw new Error(assignmentLookupError.message);
  let assignmentId = existingAssignment?.id ? String(existingAssignment.id) : "";
  if (assignmentId) {
    const { error } = await supabase
      .from("role_assignments")
      .update({
        status: "draft",
        confirmation_status: "not_sent",
        is_guest_artist: true,
        assignment_kind: input.assignmentKind,
        guest_artist_sync_status: "synced",
        playbill_sync_status: "not_ready"
      })
      .eq("id", assignmentId);
    if (error) throw new Error(error.message);
  } else {
    const { data: created, error } = await supabase
      .from("role_assignments")
      .insert({
        project_id: input.projectId,
        role_id: input.roleId,
        person_id: personId,
        status: "draft",
        confirmation_status: "not_sent",
        assignment_kind: input.assignmentKind,
        is_guest_artist: true,
        guest_artist_sync_status: "synced",
        playbill_sync_status: "not_ready",
        notes: "Assigned directly from Theatre Budget."
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    assignmentId = String(created.id);
  }
  await replaceBudgetLink("role_assignment", assignmentId, guestArtist, "theatre_budget_assignment_picker");

  let playbillError = "";
  try {
    await syncAssignmentToPlaybill(input.projectId, assignmentId);
  } catch (error) {
    playbillError = error instanceof Error ? error.message : "Playbill sync failed.";
    await markAssignmentPlaybillSyncFailed(input.projectId, assignmentId, error);
  }
  return { assignmentId, personId, guestArtist, playbillError };
}
