import {
  conflictOccurrences,
  normalizedAvailability,
  scheduleCategoryLabels,
  shortTime,
  type ConflictCalendarSnapshot,
  type ConflictWindowAnswer,
  type ConflictWindowSnapshot,
  type OneOffConflict,
} from "@/lib/rehearsal-conflicts";

export type CompanyAvailabilityStatus = "fully_available" | "partially_available" | "unavailable" | "missing";

export type CompanyAvailabilityPerson = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  roleGroups: string[];
};

export type CompanyAvailabilityResponse = {
  id: string;
  person_id: string;
  source_type: string;
  source_id: string;
  responses: ConflictWindowAnswer[];
  one_off_conflicts: OneOffConflict[];
  general_notes: string;
  submitted_at: string;
};

export type CompanyAvailabilityEntry = CompanyAvailabilityPerson & {
  status: CompanyAvailabilityStatus;
  detail: string;
  preference: string;
  generalNotes: string;
  submittedAt: string | null;
};

export type CompanyAvailabilityCall = {
  key: string;
  date: string;
  label: string;
  category: string;
  location: string;
  startsAt: string;
  endsAt: string;
  appliesTo: string;
  people: CompanyAvailabilityEntry[];
};

function appliesTo(person: CompanyAvailabilityPerson, window: ConflictWindowSnapshot) {
  if (window.applies_to === "all") return true;
  const isCast = person.roleGroups.includes("cast");
  return window.applies_to === "cast" ? isCast : person.roleGroups.some((group) => group !== "cast");
}

function intervalDetail(intervals: Array<{ starts_at: string; ends_at: string; reason: string }>) {
  return intervals.map((item) => `${shortTime(item.starts_at)}–${shortTime(item.ends_at)}${item.reason ? ` · ${item.reason}` : ""}`).join("; ");
}

function answerFor(
  person: CompanyAvailabilityPerson,
  window: ConflictWindowSnapshot,
  date: string,
  response: CompanyAvailabilityResponse | undefined,
): CompanyAvailabilityEntry {
  const base = { ...person, generalNotes: response?.general_notes ?? "", submittedAt: response?.submitted_at ?? null };
  if (!response) return { ...base, status: "missing", detail: "No availability response submitted.", preference: "" };
  const oneOff = (response.one_off_conflicts ?? []).find((item) => item.window_id === window.id && item.occurrence_date === date);
  if (oneOff) {
    return {
      ...base,
      status: oneOff.availability,
      detail: oneOff.availability === "unavailable"
        ? oneOff.unavailable_reason || "Unavailable for the entire call."
        : intervalDetail(oneOff.unavailable) || oneOff.unavailable_reason,
      preference: "",
    };
  }
  const answer = (response.responses ?? []).find((item) => item.window_id === window.id);
  if (!answer) return { ...base, status: "missing", detail: "This call was not included in the submitted response.", preference: "" };
  const status = normalizedAvailability(answer.availability) || "missing";
  const detail = status === "unavailable"
    ? answer.unavailable_reason || "Unavailable for the entire call."
    : status === "partially_available"
      ? intervalDetail(answer.unavailable)
      : "Available for this call.";
  const preference = answer.preference_enabled
    ? `${shortTime(answer.preference_start)}–${shortTime(answer.preference_end)}${answer.preference_notes ? ` · ${answer.preference_notes}` : ""}`
    : "";
  return { ...base, status, detail, preference };
}

export function buildCompanyAvailabilityCalls(input: {
  windows: ConflictWindowSnapshot[];
  calendar: ConflictCalendarSnapshot;
  people: CompanyAvailabilityPerson[];
  responses: CompanyAvailabilityResponse[];
}) {
  const latest = new Map<string, CompanyAvailabilityResponse>();
  for (const response of [...input.responses].sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))) {
    if (!latest.has(response.person_id)) latest.set(response.person_id, response);
  }
  const dated = input.windows
    .filter((window) => window.recurrence_type === "date" && window.event_date)
    .map((window) => ({ key: `${window.id}:${window.event_date}`, date: String(window.event_date), window }));
  const occurrences = [...conflictOccurrences(input.windows, input.calendar), ...dated]
    .sort((a, b) => a.date.localeCompare(b.date) || a.window.starts_at.localeCompare(b.window.starts_at) || a.window.label.localeCompare(b.window.label));

  return occurrences.map(({ key, date, window }): CompanyAvailabilityCall => ({
    key,
    date,
    label: window.label,
    category: scheduleCategoryLabels[window.schedule_category ?? "rehearsal"],
    location: window.location ?? "",
    startsAt: window.starts_at,
    endsAt: window.ends_at,
    appliesTo: window.applies_to,
    people: input.people
      .filter((person) => appliesTo(person, window))
      .map((person) => answerFor(person, window, date, latest.get(person.id)))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}
