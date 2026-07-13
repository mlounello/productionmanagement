import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function syncApprovedPublicityToPlaybill(submissionId: string) {
  // A person approval can originate from a passwordless contributor session,
  // which should not need direct write privileges in the Playbill schema.
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("push_publicity_to_playbill", { target_submission_id: submissionId });
  if (error) throw new Error(error.message);
}
