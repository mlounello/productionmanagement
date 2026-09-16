import { z } from "zod";

export const conflictDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export type ConflictWindowSnapshot = {
  id: string;
  label: string;
  recurrence_type: "weekly" | "date";
  day_of_week: number | null;
  event_date: string | null;
  starts_at: string;
  ends_at: string;
  call_type: "fixed" | "flexible";
  max_call_minutes: number | null;
  collect_preferences: boolean;
  applies_to: "cast" | "crew" | "all";
  required: boolean;
  instructions: string;
};

export type ConflictInterval = { starts_at: string; ends_at: string; reason: string };
export type ConflictWindowAnswer = {
  window_id: string;
  availability: "" | "available" | "unavailable";
  unavailable: ConflictInterval[];
  preference_enabled: boolean;
  preference_start: string;
  preference_end: string;
  preference_notes: string;
};

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const intervalSchema = z.object({ starts_at: clock, ends_at: clock, reason: z.string().trim().max(500) });
const answerSchema = z.object({
  window_id: z.string().uuid(), availability: z.enum(["available", "unavailable"]),
  unavailable: z.array(intervalSchema).max(12), preference_enabled: z.boolean(),
  preference_start: z.string().max(5), preference_end: z.string().max(5), preference_notes: z.string().trim().max(1000)
});

function minutes(value: string) { const [hour, minute] = value.slice(0, 5).split(":").map(Number); return hour * 60 + minute; }
export function shortTime(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}
export function conflictWindowDay(window: ConflictWindowSnapshot) {
  if (window.recurrence_type === "date" && window.event_date) return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${window.event_date}T12:00:00Z`));
  return conflictDays[window.day_of_week ?? 0];
}
export function conflictWindowSummary(window: ConflictWindowSnapshot) {
  const duration = window.call_type === "flexible" && window.max_call_minutes ? ` · call lasts no more than ${window.max_call_minutes / 60 >= 1 ? `${window.max_call_minutes / 60} hour${window.max_call_minutes === 60 ? "" : "s"}` : `${window.max_call_minutes} minutes`}` : "";
  return `${conflictWindowDay(window)} · ${shortTime(window.starts_at)}–${shortTime(window.ends_at)}${duration}`;
}

export function parseConflictResponses(raw: string, windows: ConflictWindowSnapshot[], requireAll: boolean) {
  let parsed: unknown;
  try { parsed = JSON.parse(raw || "[]"); } catch { throw new Error("Rehearsal availability could not be read. Review each window and try again."); }
  const result = z.array(answerSchema).max(50).safeParse(parsed);
  if (!result.success) throw new Error("Review the rehearsal availability times and try again.");
  const byId = new Map(windows.map((window) => [window.id, window]));
  const seen = new Set<string>();
  for (const answer of result.data) {
    if (seen.has(answer.window_id)) throw new Error("A rehearsal window was answered more than once.");
    seen.add(answer.window_id);
    const window = byId.get(answer.window_id);
    if (!window) throw new Error("The rehearsal schedule changed. Reload this offer before responding.");
    const start = minutes(window.starts_at), end = minutes(window.ends_at);
    if (answer.availability === "unavailable" && !answer.unavailable.length) throw new Error(`Add an unavailable time for ${window.label}.`);
    for (const interval of answer.unavailable) {
      if (minutes(interval.starts_at) < start || minutes(interval.ends_at) > end || minutes(interval.ends_at) <= minutes(interval.starts_at)) throw new Error(`${window.label} conflict times must stay between ${shortTime(window.starts_at)} and ${shortTime(window.ends_at)}.`);
    }
    if (answer.preference_enabled) {
      if (!window.collect_preferences || !clock.safeParse(answer.preference_start).success || !clock.safeParse(answer.preference_end).success || minutes(answer.preference_start) < start || minutes(answer.preference_end) > end || minutes(answer.preference_end) <= minutes(answer.preference_start)) throw new Error(`Review the preferred time for ${window.label}.`);
    }
  }
  if (requireAll) for (const window of windows) if (window.required && !seen.has(window.id)) throw new Error(`Choose your availability for ${window.label}.`);
  return result.data;
}

