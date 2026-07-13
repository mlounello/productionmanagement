import { createSupabaseServerClient } from "@/lib/supabase-server";
import { markPlaybillBioRequestSubmitted, updatePlaybillPersonPublicity } from "@/lib/playbill";

export async function syncApprovedPublicityToPlaybill(submissionId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: submission, error } = await supabase
    .from("project_publicity_submissions")
    .select("id, project_id, person_id, credited_name, bio, headshot_url, source_profile_version, status")
    .eq("id", submissionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!submission) throw new Error("Publicity submission not found.");
  if (submission.status !== "approved") throw new Error("Only editorially approved production copy can be sent to Playbill.");

  const { data: personLinks, error: personLinkError } = await supabase
    .from("external_links")
    .select("external_id, metadata")
    .eq("local_entity_type", "person")
    .eq("local_entity_id", submission.person_id)
    .eq("external_app", "playbill")
    .eq("external_schema", "app_playbill")
    .eq("external_table", "people");
  if (personLinkError) throw new Error(personLinkError.message);

  const { data: projectLink, error: projectLinkError } = await supabase
    .from("external_links")
    .select("external_id")
    .eq("local_entity_type", "project")
    .eq("local_entity_id", submission.project_id)
    .eq("external_app", "playbill")
    .eq("external_schema", "app_playbill")
    .eq("external_table", "shows")
    .maybeSingle();
  if (projectLinkError) throw new Error(projectLinkError.message);
  if (!projectLink?.external_id) throw new Error("This project is not linked to a Playbill show.");

  const personLink = (personLinks ?? []).find((link) => String((link.metadata as Record<string, unknown> | null)?.show_id ?? "") === String(projectLink.external_id));
  if (!personLink?.external_id) throw new Error("Sync the role assignment to Playbill before sending its publicity copy.");

  const { data: assignments, error: assignmentsError } = await supabase
    .from("role_assignments")
    .select("id")
    .eq("project_id", submission.project_id)
    .eq("person_id", submission.person_id)
    .not("status", "in", "(declined,withdrawn)");
  if (assignmentsError) throw new Error(assignmentsError.message);
  const assignmentIds = (assignments ?? []).map((assignment) => String(assignment.id));
  if (!assignmentIds.length) throw new Error("This person no longer has an active role assignment in the project.");

  const { data: requestLinks, error: requestLinkError } = await supabase
    .from("external_links")
    .select("external_id")
    .eq("local_entity_type", "role_assignment")
    .eq("external_app", "playbill")
    .eq("external_schema", "app_playbill")
    .eq("external_table", "submission_requests")
    .in("local_entity_id", assignmentIds);
  if (requestLinkError) throw new Error(requestLinkError.message);
  if (!requestLinks?.length) throw new Error("The linked Playbill bio request was not found. Resync the role assignment first.");

  await updatePlaybillPersonPublicity({
    personId: String(personLink.external_id),
    productionManagementPersonId: String(submission.person_id),
    productionManagementApprovalId: String(submission.id),
    profileVersion: Number(submission.source_profile_version),
    creditedName: String(submission.credited_name),
    bio: String(submission.bio),
    headshotUrl: String(submission.headshot_url)
  });
  for (const requestLink of requestLinks) await markPlaybillBioRequestSubmitted(String(requestLink.external_id));

  const syncedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("project_publicity_submissions")
    .update({ playbill_sync_status: "synced", playbill_sync_error: "", playbill_synced_at: syncedAt })
    .eq("id", submission.id);
  if (updateError) throw new Error(updateError.message);

  const { error: auditError } = await supabase.from("audit_log").insert({
    entity_type: "project_publicity_submission",
    entity_id: submission.id,
    action: "playbill_publicity_synced",
    after_value: { playbill_person_id: personLink.external_id, submission_request_ids: requestLinks.map((link) => link.external_id), synced_at: syncedAt },
    reason: "Approved production publicity snapshot sent to Playbill."
  });
  if (auditError) throw new Error(auditError.message);
}
