import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { ENABLE_PLAYBILL_WRITES } from "@/lib/config";
import { syncApprovedPublicityToPlaybill } from "@/lib/publicity-sync";

export type PublicitySyncReconciliationResult = {
  inspected: number;
  synced: number;
  failed: number;
  failures: Array<{ submissionId: string; error: string }>;
};

export async function runPublicitySyncReconciliation(limit = 100): Promise<PublicitySyncReconciliationResult> {
  if (!ENABLE_PLAYBILL_WRITES) return { inspected: 0, synced: 0, failed: 0, failures: [] };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("project_publicity_submissions")
    .select("id, playbill_submission_status")
    .in("status", ["person_approved", "approved"])
    .in("playbill_sync_status", ["not_ready", "pending", "failed", "disabled"])
    .eq("bio_required", true)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Could not load pending publicity syncs: ${error.message}`);

  const candidates = (data ?? []).filter((row) => String(row.playbill_submission_status ?? "") !== "locked");
  const result: PublicitySyncReconciliationResult = {
    inspected: candidates.length,
    synced: 0,
    failed: 0,
    failures: []
  };

  for (const candidate of candidates) {
    try {
      await syncApprovedPublicityToPlaybill(String(candidate.id));
      result.synced += 1;
    } catch (syncError) {
      result.failed += 1;
      result.failures.push({
        submissionId: String(candidate.id),
        error: syncError instanceof Error ? syncError.message : "Unknown Playbill publicity sync error."
      });
    }
  }
  return result;
}
