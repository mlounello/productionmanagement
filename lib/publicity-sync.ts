import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { stripRichTextToPlain } from "@/lib/rich-text";

export async function syncApprovedPublicityToPlaybill(submissionId: string) {
  // A person approval can originate from a passwordless contributor session,
  // which should not need direct write privileges in the Playbill schema.
  const supabase = createSupabaseAdminClient();
  const { data: submission, error: submissionError } = await supabase.from("project_publicity_submissions")
    .select("project_id, bio").eq("id", submissionId).maybeSingle();
  if (submissionError || !submission) throw new Error(submissionError?.message ?? "Publicity submission not found.");
  const { data: settings } = await supabase.from("project_publicity_settings")
    .select("bio_character_limit").eq("project_id", submission.project_id).maybeSingle();
  const bioLimit = Number(settings?.bio_character_limit ?? 350);
  if (stripRichTextToPlain(String(submission.bio ?? "")).length > bioLimit) {
    throw new Error(`Shorten this show-specific bio to ${bioLimit} characters before sending it to Playbill.`);
  }
  const { error } = await supabase.rpc("push_publicity_to_playbill", { target_submission_id: submissionId });
  if (error) throw new Error(error.message);
}
