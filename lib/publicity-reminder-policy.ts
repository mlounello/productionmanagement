export type PublicityReminderSettings = {
  remindersEnabled: boolean;
  automationEnabled: boolean;
  cadenceDays: number;
  sendLastDay: boolean;
  bioDueOn: string | null;
  headshotDueOn: string | null;
};

export type PublicityReminderSubmission = {
  bio: string;
  headshotUrl: string;
  status: string;
  playbillStatus: string;
  bioRequired: boolean;
  lastReminderSentAt: string | null;
};

export type PublicityReminderDecision = {
  eligible: boolean;
  reason:
    | "eligible_cadence"
    | "eligible_due_date"
    | "automation_disabled"
    | "reminders_disabled"
    | "not_required"
    | "locked"
    | "complete"
    | "sent_recently";
  outstanding: string[];
  dueOn: string | null;
  dueDateReminder: boolean;
};

function dateAtUtcMidnight(value: string | null) {
  if (!value) return null;
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

export function publicityOutstandingItems(submission: PublicityReminderSubmission) {
  return [
    !submission.bio.trim() ? "show-specific bio" : null,
    !submission.headshotUrl.trim() ? "headshot" : null,
    !["person_approved", "approved"].includes(submission.status) ? "your approval" : null
  ].filter(Boolean) as string[];
}

export function publicityReminderDueDate(
  settings: PublicityReminderSettings,
  outstanding: string[]
) {
  const candidates = [
    outstanding.includes("show-specific bio") || outstanding.includes("your approval") ? settings.bioDueOn : null,
    outstanding.includes("headshot") ? settings.headshotDueOn : null
  ].filter(Boolean) as string[];
  return candidates.sort()[0] ?? null;
}

export function publicityReminderDecision(
  settings: PublicityReminderSettings,
  submission: PublicityReminderSubmission,
  now = new Date()
): PublicityReminderDecision {
  const outstanding = publicityOutstandingItems(submission);
  const dueOn = publicityReminderDueDate(settings, outstanding);
  const base = { outstanding, dueOn, dueDateReminder: false };
  if (!settings.remindersEnabled) return { ...base, eligible: false, reason: "reminders_disabled" };
  if (!settings.automationEnabled) return { ...base, eligible: false, reason: "automation_disabled" };
  if (!submission.bioRequired) return { ...base, eligible: false, reason: "not_required" };
  if (submission.playbillStatus === "locked") return { ...base, eligible: false, reason: "locked" };
  if (!outstanding.length) return { ...base, eligible: false, reason: "complete" };

  const dueAt = dateAtUtcMidnight(dueOn);
  const dueDateReminder = Boolean(settings.sendLastDay && dueAt !== null && now.getTime() >= dueAt);
  if (dueDateReminder) {
    return { ...base, dueDateReminder: true, eligible: true, reason: "eligible_due_date" };
  }

  if (submission.lastReminderSentAt) {
    const lastSentAt = Date.parse(submission.lastReminderSentAt);
    const recentWindowDays = Math.max(0, settings.cadenceDays - 1);
    const recentCutoff = now.getTime() - recentWindowDays * 24 * 60 * 60 * 1000;
    if (Number.isFinite(lastSentAt) && lastSentAt >= recentCutoff) {
      return { ...base, eligible: false, reason: "sent_recently" };
    }
  }
  return { ...base, eligible: true, reason: "eligible_cadence" };
}
