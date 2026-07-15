import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { ENABLE_PLAYBILL_WRITES } from "@/lib/config";
import { publicitySyncBlockReason, publicityWritesDisabledReason, type PlaybillPublicityWriteState } from "@/lib/publicity-sync-policy";
import { stripRichTextToPlain } from "@/lib/rich-text";

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
  const disabledReason = publicityWritesDisabledReason(ENABLE_PLAYBILL_WRITES);
  if (disabledReason) throw new PublicitySyncError(disabledReason, "disabled");

  // A person approval can originate from a passwordless contributor session,
  // which should not need direct write privileges in the Playbill schema.
  const supabase = createSupabaseAdminClient();
  const { data: submission, error: submissionError } = await supabase.from("project_publicity_submissions")
    .select("project_id, bio, bio_required").eq("id", submissionId).maybeSingle();
  if (submissionError || !submission) throw new Error(submissionError?.message ?? "Publicity submission not found.");
  if (submission.bio_required === false) throw new PublicitySyncError("This person is marked bio not required for this project.", "disabled");
  const { data: settings } = await supabase.from("project_publicity_settings")
    .select("bio_character_limit").eq("project_id", submission.project_id).maybeSingle();
  const bioLimit = Number(settings?.bio_character_limit ?? 350);
  if (stripRichTextToPlain(String(submission.bio ?? "")).length > bioLimit) {
    throw new Error(`Shorten this show-specific bio to ${bioLimit} characters before sending it to Playbill.`);
  }

  const { data: writeState, error: stateError } = await supabase.rpc("get_publicity_playbill_sync_state", {
    target_submission_id: submissionId
  });
  if (stateError) throw new PublicitySyncError(stateError.message);
  const blockReason = publicitySyncBlockReason(writeState as PlaybillPublicityWriteState | null);
  if (blockReason) throw new PublicitySyncError(blockReason);

  const { error } = await supabase.rpc("push_publicity_to_playbill", { target_submission_id: submissionId });
  if (error) throw new PublicitySyncError(error.message);
}
