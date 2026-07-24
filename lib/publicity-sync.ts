import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { ENABLE_PLAYBILL_WRITES } from "@/lib/config";
import { publicitySyncBlockReason, publicityWritesDisabledReason, type PlaybillPublicityWriteState } from "@/lib/publicity-sync-policy";
import { stripRichTextToPlain } from "@/lib/rich-text";
import { syncAssignmentToPlaybillAsSystem } from "@/lib/playbill-sync";

export class PublicitySyncError extends Error {
  readonly syncStatus: "disabled" | "failed";

  constructor(message: string, syncStatus: "disabled" | "failed" = "failed") {
    super(message);
    this.name = "PublicitySyncError";
    this.syncStatus = syncStatus;
  }
}

export function publicitySyncFailureStatus(error: unknown): "disabled" | "failed" {
  return error instanceof PublicitySyncError ? error.syncStatus : "failed";
}

export async function syncApprovedPublicityToPlaybill(submissionId: string) {
  // A person approval can originate from a passwordless contributor session,
  // which should not need direct write privileges in the Playbill schema.
  const supabase = createSupabaseAdminClient();
  try {
    const disabledReason = publicityWritesDisabledReason(ENABLE_PLAYBILL_WRITES);
    if (disabledReason) throw new PublicitySyncError(disabledReason, "disabled");

    const { data: submission, error: submissionError } = await supabase.from("project_publicity_submissions")
      .select("project_id, person_id, bio, bio_required").eq("id", submissionId).maybeSingle();
    if (submissionError || !submission) throw new Error(submissionError?.message ?? "Publicity submission not found.");
    if (submission.bio_required === false) throw new PublicitySyncError("This person is marked bio not required for this project.", "disabled");
    const { data: settings } = await supabase.from("project_publicity_settings")
      .select("bio_character_limit").eq("project_id", submission.project_id).maybeSingle();
    const bioLimit = Number(settings?.bio_character_limit ?? 350);
    if (stripRichTextToPlain(String(submission.bio ?? "")).length > bioLimit) {
      throw new Error(`Shorten this show-specific bio to ${bioLimit} characters before sending it to Playbill.`);
    }

    // A publicity copy depends on the Playbill person, role, and submission
    // request created by assignment sync. Repair that dependency automatically
    // before attempting the copy transfer.
    const { data: assignments, error: assignmentsError } = await supabase
      .from("role_assignments")
      .select("id")
      .eq("project_id", submission.project_id)
      .eq("person_id", submission.person_id)
      .not("status", "in", "(declined,withdrawn)");
    if (assignmentsError) throw new PublicitySyncError(assignmentsError.message);
    if (!assignments?.length) {
      throw new PublicitySyncError("This person does not have an active role assignment in this project.");
    }

    const dependencyWarnings: string[] = [];
    let syncedAssignmentCount = 0;
    for (const assignment of assignments) {
      try {
        const result = await syncAssignmentToPlaybillAsSystem(submission.project_id, String(assignment.id));
        if (result) syncedAssignmentCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Playbill assignment sync failed.";
        dependencyWarnings.push(message);
        await supabase.from("role_assignments").update({
          playbill_sync_status: "failed",
          sync_notes: message
        }).eq("project_id", submission.project_id).eq("id", assignment.id);
      }
    }
    if (syncedAssignmentCount === 0 && dependencyWarnings.length > 0) {
      throw new PublicitySyncError(`Production Management could not prepare the Playbill role automatically: ${dependencyWarnings[0]}`);
    }

    const { data: writeState, error: stateError } = await supabase.rpc("get_publicity_playbill_sync_state", {
      target_submission_id: submissionId
    });
    if (stateError) throw new PublicitySyncError(stateError.message);
    const blockReason = publicitySyncBlockReason(writeState as PlaybillPublicityWriteState | null);
    if (blockReason) throw new PublicitySyncError(blockReason);

    const { error } = await supabase.rpc("push_publicity_to_playbill", { target_submission_id: submissionId });
    if (error) throw new PublicitySyncError(error.message);
    return { syncedAssignmentCount, dependencyWarnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Playbill publicity sync failed.";
    await supabase.from("project_publicity_submissions").update({
      playbill_sync_status: publicitySyncFailureStatus(error),
      playbill_sync_error: message
    }).eq("id", submissionId);
    throw error;
  }
}
