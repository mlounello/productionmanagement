export type AuditionCalendarSyncStatus = "skipped" | "synced" | "partial" | "failed";

export function auditionCalendarAggregateStatus(successfulSlots: number, failedSlots: number): AuditionCalendarSyncStatus {
  if (failedSlots > 0 && successfulSlots > 0) return "partial";
  if (failedSlots > 0) return "failed";
  if (successfulSlots > 0) return "synced";
  return "skipped";
}
