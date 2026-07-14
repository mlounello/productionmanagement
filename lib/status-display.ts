export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";
export type StatusContext = "general" | "google-membership" | "welcome-email" | "playbill" | "publicity";

const LABELS: Record<string, string> = {
  not_attempted: "Not attempted", already_sent: "Already sent", person_approved: "Person approved",
  changes_requested: "Changes requested", no_show: "No show", in_progress: "In progress",
  not_checked: "Not checked", not_prepared: "Not prepared",
};

export function displayStatus(value?: string | null) {
  const normalized = String(value || "not_attempted").trim().toLowerCase();
  return LABELS[normalized] || normalized.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function statusTone(value?: string | null): StatusTone {
  const status = String(value || "").toLowerCase();
  if (["failed", "error", "missing", "declined", "bounced", "no_show", "returned", "partial"].includes(status)) return "danger";
  if (["created", "synced", "verified", "sent", "already_sent", "approved", "person_approved", "published", "confirmed", "linked", "accepted", "ready", "filled", "cast", "auditioned", "checked_in", "locked", "complete"].includes(status)) return "success";
  if (["pending", "changes_requested", "changes_needed", "needs_review", "duplicate", "waitlist", "callback", "sending", "offered", "recommended", "invited", "considering", "acceptance_pending", "publicity_pending", "attention"].includes(status)) return "warning";
  if (["draft", "in_progress", "submitted", "scheduled", "vacant", "registered", "guest_artist", "opened", "onboarding"].includes(status)) return "info";
  return "neutral";
}

export function statusDescription(value: string | null | undefined, context: StatusContext = "general") {
  const status = String(value || "not_attempted").toLowerCase();
  const contextual: Record<StatusContext, Record<string, string>> = {
    "google-membership": { missing: "This email was not found in the connected Google Group.", synced: "Membership was confirmed during the most recent check.", skipped: "Google membership and production communications are intentionally skipped.", failed: "The membership check could not be completed; the role assignment is still saved.", not_attempted: "Membership has not been checked yet." },
    "welcome-email": { sent: "The custom welcome email was delivered for this assignment.", already_sent: "A welcome email was previously delivered; use resend only when needed.", skipped: "The welcome email is intentionally skipped for this assignment.", failed: "The email could not be delivered; the role assignment is still saved.", not_attempted: "No welcome email has been sent for this assignment." },
    playbill: { draft: "The production copy can still be edited in Production Management.", submitted: "The person-approved copy is waiting for Playbill editorial review.", returned: "Playbill returned this copy for changes.", approved: "Playbill has editorially approved this copy.", locked: "This final Playbill copy is read-only and retained for history." },
    publicity: { draft: "The production copy is being prepared and has not been approved by the person.", person_approved: "The person approved this production-specific copy.", changes_requested: "The person requested an update before submission.", approved: "This copy is approved for the production." },
    general: {},
  };
  return contextual[context][status] || `Current status: ${displayStatus(status)}.`;
}
