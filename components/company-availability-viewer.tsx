"use client";

import { useMemo, useState } from "react";
import { shortTime } from "@/lib/rehearsal-conflicts";
import type { CompanyAvailabilityCall, CompanyAvailabilityEntry, CompanyAvailabilityPerson, CompanyAvailabilityStatus } from "@/lib/company-availability";

type Selection = { kind: "call"; key: string } | { kind: "person"; id: string } | null;
const statusLabels: Record<CompanyAvailabilityStatus, string> = { fully_available: "Available", partially_available: "Partial conflict", unavailable: "Unavailable", missing: "Response missing" };
const statusOrder: Record<CompanyAvailabilityStatus, number> = { unavailable: 0, partially_available: 1, missing: 2, fully_available: 3 };

function dateLabel(value: string, long = false) {
  return new Intl.DateTimeFormat("en-US", { weekday: long ? "long" : "short", month: long ? "long" : "short", day: "numeric", year: long ? "numeric" : undefined, timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}
function monthLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}-01T12:00:00Z`));
}
function monthShift(value: string, amount: number) {
  const date = new Date(`${value}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + amount); return date.toISOString().slice(0, 7);
}
function callTone(call: CompanyAvailabilityCall) {
  if (call.people.some((person) => person.status === "unavailable")) return "unavailable";
  if (call.people.some((person) => person.status === "partially_available")) return "partial";
  if (call.people.some((person) => person.status === "missing")) return "missing";
  return "available";
}
function counts(people: CompanyAvailabilityEntry[]) {
  return people.reduce((result, person) => ({ ...result, [person.status]: result[person.status] + 1 }), { fully_available: 0, partially_available: 0, unavailable: 0, missing: 0 } as Record<CompanyAvailabilityStatus, number>);
}

export function CompanyAvailabilityViewer({ calls, people }: { calls: CompanyAvailabilityCall[]; people: CompanyAvailabilityPerson[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const firstRelevant = calls.find((call) => call.date >= today)?.date ?? calls[0]?.date ?? today;
  const [month, setMonth] = useState(firstRelevant.slice(0, 7));
  const [view, setView] = useState<"calendar" | "calls" | "people">("calendar");
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<"all" | "conflicts" | "missing">("all");
  const [selection, setSelection] = useState<Selection>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const visiblePeople = useMemo(() => people.filter((person) => !normalizedQuery || `${person.name} ${person.email} ${person.roles.join(" ")}`.toLowerCase().includes(normalizedQuery)), [people, normalizedQuery]);
  const visibleIds = useMemo(() => new Set(visiblePeople.map((person) => person.id)), [visiblePeople]);
  const visibleCalls = useMemo(() => calls.map((call) => ({ ...call, people: call.people.filter((person) => visibleIds.has(person.id)) })).filter((call) => {
    if (!call.people.length) return false;
    if (show === "conflicts") return call.people.some((person) => person.status === "partially_available" || person.status === "unavailable");
    if (show === "missing") return call.people.some((person) => person.status === "missing");
    return true;
  }), [calls, show, visibleIds]);
  const allEntries = visibleCalls.flatMap((call) => call.people);
  const summary = counts(allEntries);
  const selectedCall = selection?.kind === "call" ? calls.find((call) => call.key === selection.key) : undefined;
  const selectedPerson = selection?.kind === "person" ? people.find((person) => person.id === selection.id) : undefined;
  const selectedPersonCalls = selectedPerson ? calls.map((call) => ({ call, person: call.people.find((entry) => entry.id === selectedPerson.id) })).filter((item): item is { call: CompanyAvailabilityCall; person: CompanyAvailabilityEntry } => Boolean(item.person)) : [];

  const monthStart = new Date(`${month}-01T12:00:00Z`);
  const gridStart = new Date(monthStart); gridStart.setUTCDate(1 - monthStart.getUTCDay());
  const days = Array.from({ length: 42 }, (_, index) => { const date = new Date(gridStart); date.setUTCDate(gridStart.getUTCDate() + index); return date.toISOString().slice(0, 10); });

  return <>
    <section className="availability-toolbar panel no-print">
      <div className="availability-view-switch" role="tablist" aria-label="Availability views">
        {(["calendar", "calls", "people"] as const).map((item) => <button type="button" role="tab" aria-selected={view === item} className={view === item ? "active" : "secondary"} onClick={() => setView(item)} key={item}>{item === "calendar" ? "Calendar" : item === "calls" ? "By Call" : "By Person"}</button>)}
      </div>
      <label className="field"><span>Find a company member</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, role, or email"/></label>
      <label className="field"><span>Show</span><select value={show} onChange={(event) => setShow(event.target.value as typeof show)}><option value="all">All calls</option><option value="conflicts">Calls with conflicts</option><option value="missing">Missing responses</option></select></label>
      <button type="button" className="secondary" onClick={() => window.print()}>Print current view</button>
    </section>

    <section className="availability-summary-grid">
      <article className="availability-summary-card unavailable"><strong>{summary.unavailable}</strong><span>Unavailable entries</span></article>
      <article className="availability-summary-card partial"><strong>{summary.partially_available}</strong><span>Partial conflicts</span></article>
      <article className="availability-summary-card missing"><strong>{summary.missing}</strong><span>Missing responses</span></article>
      <article className="availability-summary-card available"><strong>{summary.fully_available}</strong><span>Available entries</span></article>
    </section>

    {view === "calendar" ? <section className="panel availability-calendar-panel"><div className="availability-calendar-heading"><button type="button" className="secondary no-print" onClick={() => setMonth(monthShift(month, -1))} aria-label="Previous month">←</button><h2>{monthLabel(month)}</h2><button type="button" className="secondary no-print" onClick={() => setMonth(monthShift(month, 1))} aria-label="Next month">→</button></div><div className="availability-weekdays" aria-hidden="true">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day) => <span key={day}>{day}</span>)}</div><div className="availability-calendar-grid">{days.map((date) => { const dayCalls = visibleCalls.filter((call) => call.date === date); return <div className={`availability-day ${date.slice(0,7) !== month ? "outside" : ""} ${date === today ? "today" : ""}`} key={date}><span className="availability-day-number">{Number(date.slice(8,10))}</span>{dayCalls.map((call) => { const total = counts(call.people); return <button type="button" className={`availability-event ${callTone(call)}`} onClick={() => setSelection({ kind: "call", key: call.key })} key={call.key}><strong>{call.label}</strong><span>{shortTime(call.startsAt)} · {total.unavailable + total.partially_available ? `${total.unavailable + total.partially_available} conflict${total.unavailable + total.partially_available === 1 ? "" : "s"}` : total.missing ? `${total.missing} missing` : "All clear"}</span></button>; })}</div>; })}</div></section> : null}

    {view === "calls" ? <section className="panel availability-call-list"><div className="section-heading"><div><p className="eyebrow">Schedule order</p><h2>Availability by call</h2></div></div>{visibleCalls.map((call) => { const total = counts(call.people); return <button type="button" className="availability-call-row" onClick={() => setSelection({ kind: "call", key: call.key })} key={call.key}><span><strong>{dateLabel(call.date, true)}</strong><small>{call.label} · {shortTime(call.startsAt)}–{shortTime(call.endsAt)}{call.location ? ` · ${call.location}` : ""}</small></span><span className="availability-mini-counts"><i className="unavailable">{total.unavailable} unavailable</i><i className="partial">{total.partially_available} partial</i><i className="missing">{total.missing} missing</i></span></button>; })}{!visibleCalls.length ? <p className="empty-state">No calls match these filters.</p> : null}</section> : null}

    {view === "people" ? <section className="panel availability-people-list"><div className="section-heading"><div><p className="eyebrow">Company</p><h2>Availability by person</h2></div></div>{visiblePeople.map((person) => { const entries = calls.flatMap((call) => call.people.filter((entry) => entry.id === person.id)); const total = counts(entries); return <button type="button" className="availability-person-row" onClick={() => setSelection({ kind: "person", id: person.id })} key={person.id}><span><strong>{person.name}</strong><small>{person.roles.join(", ") || "No active role"}</small></span><span className="availability-mini-counts"><i className="unavailable">{total.unavailable} unavailable</i><i className="partial">{total.partially_available} partial</i><i className="missing">{total.missing} missing</i></span></button>; })}{!visiblePeople.length ? <p className="empty-state">No company members match this search.</p> : null}</section> : null}

    {selection ? <><button type="button" className="drawer-scrim no-print" aria-label="Close details" onClick={() => setSelection(null)}/><aside className="people-drawer availability-drawer no-print" aria-label="Availability details"><header className="people-drawer-header"><div>{selectedCall ? <><p className="eyebrow">{selectedCall.category}</p><h2>{selectedCall.label}</h2><span>{dateLabel(selectedCall.date, true)} · {shortTime(selectedCall.startsAt)}–{shortTime(selectedCall.endsAt)}</span></> : selectedPerson ? <><p className="eyebrow">Company member</p><h2>{selectedPerson.name}</h2><span>{selectedPerson.roles.join(", ")}</span></> : null}</div><button type="button" className="drawer-close" onClick={() => setSelection(null)} aria-label="Close">×</button></header><div className="people-drawer-body">
        {selectedCall ? <>{selectedCall.location ? <p><strong>Location:</strong> {selectedCall.location}</p> : null}<AvailabilityEntryList entries={[...selectedCall.people].sort((a,b) => statusOrder[a.status] - statusOrder[b.status] || a.name.localeCompare(b.name))}/></> : null}
        {selectedPerson ? <div className="availability-person-calls">{selectedPersonCalls.map(({ call, person }) => <article className={`availability-detail-card ${person.status}`} key={call.key}><div><strong>{dateLabel(call.date, true)} · {call.label}</strong><span>{shortTime(call.startsAt)}–{shortTime(call.endsAt)}</span></div><AvailabilityStatus entry={person}/></article>)}</div> : null}
      </div></aside></> : null}
  </>;
}

function AvailabilityEntryList({ entries }: { entries: CompanyAvailabilityEntry[] }) {
  return <div className="availability-entry-list">{entries.map((entry) => <article className={`availability-detail-card ${entry.status}`} key={entry.id}><div><strong>{entry.name}</strong><span>{entry.roles.join(", ")}</span></div><AvailabilityStatus entry={entry}/></article>)}</div>;
}

function AvailabilityStatus({ entry }: { entry: CompanyAvailabilityEntry }) {
  return <div className="availability-status-detail"><span className={`availability-status-chip ${entry.status}`}>{statusLabels[entry.status]}</span><p>{entry.detail}</p>{entry.preference ? <p><strong>Preference:</strong> {entry.preference}</p> : null}{entry.generalNotes && entry.status !== "fully_available" ? <p><strong>General note:</strong> {entry.generalNotes}</p> : null}</div>;
}
