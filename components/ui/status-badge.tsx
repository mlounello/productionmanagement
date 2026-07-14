import { displayStatus, statusDescription, statusTone, type StatusContext } from "@/lib/status-display";

export function StatusBadge({ status, context = "general", label }: { status?: string | null; context?: StatusContext; label?: string }) {
  return <span className={`status-badge ${statusTone(status)}`} title={statusDescription(status, context)}>{label || displayStatus(status)}</span>;
}
