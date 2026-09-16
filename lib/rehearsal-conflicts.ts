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
  schedule_category?: ScheduleCategory;
  location?: string;
  include_in_audition?: boolean;
};

export const scheduleCategories = ["rehearsal", "designer_run", "tech", "dress", "photo_call", "performance", "strike", "other"] as const;
export type ScheduleCategory = typeof scheduleCategories[number];
export const scheduleCategoryLabels: Record<ScheduleCategory,string> = {
  rehearsal:"Rehearsal",designer_run:"Designer Run",tech:"Tech",dress:"Dress Rehearsal",photo_call:"Preview / Photo Call",performance:"Performance",strike:"Strike",other:"Other"
};

export type ConflictInterval = { starts_at: string; ends_at: string; reason: string };
export type ConflictWindowAnswer = {
  window_id: string;
  availability: "" | "fully_available" | "partially_available" | "unavailable" | "available";
  unavailable_reason: string;
  unavailable: ConflictInterval[];
  preference_enabled: boolean;
  preference_start: string;
  preference_end: string;
  preference_notes: string;
};

export type CommitmentGroup = "rehearsal" | "tech" | "performance" | "other";

export function commitmentGroupForWindow(window: ConflictWindowSnapshot): CommitmentGroup {
  const category = window.schedule_category;
  if (window.recurrence_type === "weekly" || category === "rehearsal") return "rehearsal";
  if (category && ["designer_run", "tech", "dress", "photo_call"].includes(category)) return "tech";
  if (category && ["performance", "strike"].includes(category)) return "performance";
  if (!category) {
    const label = window.label.toLowerCase();
    if (/designer|tech|dress|preview|photo/.test(label)) return "tech";
    if (/performance|opening|closing|strike/.test(label)) return "performance";
  }
  return "other";
}

export function isMandatoryProductionCall(window: ConflictWindowSnapshot) {
  return window.recurrence_type === "date" && commitmentGroupForWindow(window) !== "rehearsal";
}

export function commitmentGroupForSection(section: { key: string; title: string }): CommitmentGroup {
  const value = `${section.key} ${section.title}`.toLowerCase();
  if (value.includes("tech") || value.includes("dress")) return "tech";
  if (value.includes("performance") || value.includes("strike")) return "performance";
  if (value.includes("rehearsal")) return "rehearsal";
  return "other";
}

export type ConflictCalendarSnapshot = { starts_on: string; ends_on: string; excluded_dates: string[] } | null;
export type OneOffConflict = {
  window_id: string; occurrence_date: string; availability: "partially_available" | "unavailable";
  unavailable_reason: string; unavailable: ConflictInterval[];
};

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const intervalSchema = z.object({ starts_at: clock, ends_at: clock, reason: z.string().trim().min(1).max(500) });
const answerSchema = z.object({
  window_id: z.string().uuid(), availability: z.enum(["fully_available", "partially_available", "unavailable", "available"]),
  unavailable_reason: z.string().trim().max(500).default(""), unavailable: z.array(intervalSchema).max(12), preference_enabled: z.boolean(),
  preference_start: z.string().max(5), preference_end: z.string().max(5), preference_notes: z.string().trim().max(1000)
});
const oneOffSchema = z.object({ window_id: z.string().uuid(), occurrence_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), availability: z.enum(["partially_available", "unavailable"]), unavailable_reason: z.string().trim().min(1).max(500), unavailable: z.array(intervalSchema).max(12) });

function minutes(value: string) { const [hour, minute] = value.slice(0, 5).split(":").map(Number); return hour * 60 + minute; }
function overlaps(start: number, end: number, windowStart: number, windowEnd: number) {
  return end > start && start < windowEnd && end > windowStart;
}
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
  const location=window.location?.trim()?` · ${window.location.trim()}`:"";
  return `${conflictWindowDay(window)} · ${shortTime(window.starts_at)}–${shortTime(window.ends_at)}${location}${duration}`;
}
export function sortConflictWindows<T extends ConflictWindowSnapshot>(windows: T[]) {
  return [...windows].sort((a,b) => {
    const kind = (a.recurrence_type === "weekly" ? 0 : 1) - (b.recurrence_type === "weekly" ? 0 : 1);
    if(kind) return kind;
    if(a.recurrence_type === "weekly") return (a.day_of_week ?? 7) - (b.day_of_week ?? 7) || a.starts_at.localeCompare(b.starts_at) || a.label.localeCompare(b.label);
    return String(a.event_date).localeCompare(String(b.event_date)) || a.starts_at.localeCompare(b.starts_at) || a.label.localeCompare(b.label);
  });
}
export function normalizedAvailability(value: ConflictWindowAnswer["availability"]) { return value === "available" ? "fully_available" : value; }
export function conflictOccurrences(windows: ConflictWindowSnapshot[], calendar: ConflictCalendarSnapshot) {
  if(!calendar?.starts_on || !calendar.ends_on) return [];
  const excluded=new Set(calendar.excluded_dates??[]), result:Array<{key:string;date:string;window:ConflictWindowSnapshot}>=[];
  const cursor=new Date(`${calendar.starts_on}T12:00:00Z`), end=new Date(`${calendar.ends_on}T12:00:00Z`);
  for(;cursor<=end;cursor.setUTCDate(cursor.getUTCDate()+1)){
    const date=cursor.toISOString().slice(0,10);if(excluded.has(date))continue;
    for(const window of windows)if(window.recurrence_type==="weekly"&&window.day_of_week===cursor.getUTCDay())result.push({key:`${window.id}:${date}`,date,window});
  }
  return result;
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
    const availability=normalizedAvailability(answer.availability);
    if (availability === "partially_available" && !answer.unavailable.length) throw new Error(`Add the times you cannot attend for ${window.label}.`);
    if (availability === "unavailable" && !answer.unavailable_reason) throw new Error(`Explain why you are unavailable for ${window.label}.`);
    for (const interval of answer.unavailable) {
      if (!overlaps(minutes(interval.starts_at), minutes(interval.ends_at), start, end)) throw new Error(`${window.label} conflict times must overlap the rehearsal window of ${shortTime(window.starts_at)}–${shortTime(window.ends_at)}.`);
    }
    if (answer.preference_enabled) {
      if (!window.collect_preferences || !clock.safeParse(answer.preference_start).success || !clock.safeParse(answer.preference_end).success || minutes(answer.preference_start) < start || minutes(answer.preference_end) > end || minutes(answer.preference_end) <= minutes(answer.preference_start)) throw new Error(`Review the preferred time for ${window.label}.`);
    }
  }
  if (requireAll) for (const window of windows) if (window.required && !seen.has(window.id)) throw new Error(`Choose your availability for ${window.label}.`);
  return result.data;
}

export function parseOneOffConflicts(raw:string, windows:ConflictWindowSnapshot[], calendar:ConflictCalendarSnapshot){
  let parsed:unknown;try{parsed=JSON.parse(raw||"[]");}catch{throw new Error("One-off conflicts could not be read.");}
  const result=z.array(oneOffSchema).max(50).safeParse(parsed);if(!result.success)throw new Error("Review each one-off conflict, including its reason.");
  const byId=new Map(windows.map(window=>[window.id,window])), valid=new Set(conflictOccurrences(windows,calendar).map(item=>item.key));
  for(const item of result.data){const window=byId.get(item.window_id);if(!window||!valid.has(`${item.window_id}:${item.occurrence_date}`))throw new Error("A selected rehearsal date is no longer available. Reload and review your one-off conflicts.");
    if(item.availability==="partially_available"&&!item.unavailable.length)throw new Error(`Add the times you cannot attend on ${item.occurrence_date}.`);
    const start=minutes(window.starts_at),end=minutes(window.ends_at);for(const interval of item.unavailable)if(!overlaps(minutes(interval.starts_at),minutes(interval.ends_at),start,end))throw new Error(`One-off conflict times must overlap the rehearsal window of ${shortTime(window.starts_at)}–${shortTime(window.ends_at)}.`);
  }return result.data;
}
