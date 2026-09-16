"use client";

import { useMemo, useState } from "react";
import { sanitizeRichText } from "@/lib/rich-text";
import type { OfferSection } from "@/lib/casting-offers";
import {
  commitmentGroupForSection, commitmentGroupForWindow, conflictOccurrences, conflictWindowSummary,
  isMandatoryProductionCall, sortConflictWindows, type CommitmentGroup, type ConflictCalendarSnapshot,
  type ConflictWindowAnswer, type ConflictWindowSnapshot, type OneOffConflict,
} from "@/lib/rehearsal-conflicts";

function blank(windowId: string): ConflictWindowAnswer {
  return { window_id: windowId, availability: "", unavailable_reason: "", unavailable: [{ starts_at: "", ends_at: "", reason: "" }], preference_enabled: false, preference_start: "", preference_end: "", preference_notes: "" };
}
function blankOneOff(key: string, windows: ConflictWindowSnapshot[]): OneOffConflict {
  const [windowId, date] = key.split(":"); const window = windows.find((item) => item.id === windowId);
  return { window_id: windowId, occurrence_date: date, availability: "unavailable", unavailable_reason: "", unavailable: [{ starts_at: window?.starts_at.slice(0, 5) ?? "", ends_at: window?.ends_at.slice(0, 5) ?? "", reason: "" }] };
}
const groupLabels: Record<CommitmentGroup, string> = { rehearsal: "Rehearsals", tech: "Tech and dress", performance: "Performances and strike", other: "Other required calls" };

export function ConflictResponseEditor({ windows, calendar, name = "conflictResponses", oneOffName = "oneOffConflicts", initialAnswers = [], initialOneOff = [], agreementSections = [] }: {
  windows: ConflictWindowSnapshot[]; calendar?: ConflictCalendarSnapshot; name?: string; oneOffName?: string;
  initialAnswers?: ConflictWindowAnswer[]; initialOneOff?: OneOffConflict[]; agreementSections?: OfferSection[];
}) {
  const ordered = useMemo(() => sortConflictWindows(windows), [windows]);
  const occurrences = useMemo(() => conflictOccurrences(ordered, calendar ?? null), [ordered, calendar]);
  const [answers, setAnswers] = useState<Record<string, ConflictWindowAnswer>>(() => Object.fromEntries(ordered.map((window) => {
    const saved = initialAnswers.find((answer) => answer.window_id === window.id);
    if (!saved) return [window.id, blank(window.id)];
    if (isMandatoryProductionCall(window) && saved.availability === "partially_available" && !saved.unavailable_reason) return [window.id, { ...saved, unavailable_reason: saved.unavailable[0]?.reason ?? "" }];
    return [window.id, saved];
  })));
  const [oneOff, setOneOff] = useState<OneOffConflict[]>(initialOneOff); const [selectedOccurrence, setSelectedOccurrence] = useState("");
  const serialized = useMemo(() => JSON.stringify(Object.values(answers).filter((answer) => answer.availability).map((answer) => {
    const window = ordered.find((item) => item.id === answer.window_id);
    if (window && isMandatoryProductionCall(window) && answer.availability === "partially_available") return { ...answer, unavailable: [{ starts_at: window.starts_at.slice(0, 5), ends_at: window.ends_at.slice(0, 5), reason: answer.unavailable_reason }] };
    return { ...answer, unavailable: answer.availability === "partially_available" ? answer.unavailable : [] };
  })), [answers, ordered]);
  const oneOffSerialized = useMemo(() => JSON.stringify(oneOff.map((item) => ({ ...item, unavailable: item.availability === "partially_available" ? item.unavailable.map((range) => ({ ...range, reason: item.unavailable_reason })) : [] }))), [oneOff]);
  const update = (id: string, change: Partial<ConflictWindowAnswer>) => setAnswers((current) => ({ ...current, [id]: { ...current[id], ...change } }));
  const addOneOff = () => { if (!selectedOccurrence || oneOff.some((item) => `${item.window_id}:${item.occurrence_date}` === selectedOccurrence)) return; setOneOff((current) => [...current, blankOneOff(selectedOccurrence, ordered)]); setSelectedOccurrence(""); };

  const renderWindow = (window: ConflictWindowSnapshot) => {
    const answer = answers[window.id]; const mandatory = isMandatoryProductionCall(window);
    return <fieldset className={`conflict-window-card${mandatory ? " mandatory-call-card" : ""}`} key={window.id}>
      <legend>{window.label}{window.required ? " *" : ""}</legend>
      <p><strong>{conflictWindowSummary(window)}</strong>{window.instructions ? <><br /><span className="muted">{window.instructions}</span></> : null}</p>
      <label className="field"><span>{mandatory ? "Availability for this required call" : "My availability"}</span><select required={window.required} value={answer.availability} onChange={(event) => {
        const availability = event.target.value as ConflictWindowAnswer["availability"];
        update(window.id, { availability, ...(mandatory && availability === "partially_available" ? { unavailable: [{ starts_at: window.starts_at.slice(0, 5), ends_at: window.ends_at.slice(0, 5), reason: answer.unavailable_reason }] } : {}) });
      }}><option value="">Choose one</option><option value="fully_available">Fully Available</option>{mandatory ? <><option value="partially_available">I have class, but will notify the professor early about my absence and copy the production manager.</option><option value="unavailable">I am unavailable, and understand this may change casting.</option></> : <><option value="partially_available">Partially Available</option><option value="unavailable">Unavailable</option></>}</select></label>
      {mandatory && answer.availability ? <label className="field"><span>{answer.availability === "partially_available" ? "Class conflict note *" : answer.availability === "unavailable" ? "Unavailability note *" : "Note (optional)"}</span><textarea required={["partially_available", "unavailable"].includes(answer.availability)} rows={2} maxLength={500} value={answer.unavailable_reason} onChange={(event) => update(window.id, { unavailable_reason: event.target.value })} /><small>{answer.availability === "partially_available" ? "List the class and any useful context. This call remains mandatory; contact your professor early and copy the production manager." : answer.availability === "unavailable" ? "Explain the conflict clearly. Production staff will review it before casting is finalized." : "Add any useful context about this call if needed."}</small></label> : null}
      {!mandatory && answer.availability === "partially_available" ? <div className="conflict-ranges"><h4>Times I cannot attend</h4><p className="muted">Enter the full time of your conflict—not the times you are free. It may begin before or end after rehearsal as long as it overlaps the rehearsal.</p>{answer.unavailable.map((interval, index) => <div className="conflict-range-row" key={index}>
        <label className="field"><span>Conflict begins</span><input type="time" required defaultValue={interval.starts_at} onChange={(event) => update(window.id, { unavailable: answer.unavailable.map((item, i) => i === index ? { ...item, starts_at: event.target.value } : item) })} /></label>
        <label className="field"><span>Conflict ends</span><input type="time" required defaultValue={interval.ends_at} onChange={(event) => update(window.id, { unavailable: answer.unavailable.map((item, i) => i === index ? { ...item, ends_at: event.target.value } : item) })} /></label>
        <label className="field conflict-reason"><span>Why are you unavailable? *</span><input required maxLength={500} value={interval.reason} onChange={(event) => update(window.id, { unavailable: answer.unavailable.map((item, i) => i === index ? { ...item, reason: event.target.value } : item) })} /></label>
        {answer.unavailable.length > 1 ? <button className="secondary compact-button" type="button" onClick={() => update(window.id, { unavailable: answer.unavailable.filter((_, i) => i !== index) })}>Remove</button> : null}
      </div>)}<button className="secondary" type="button" onClick={() => update(window.id, { unavailable: [...answer.unavailable, { starts_at: "", ends_at: "", reason: "" }] })}>Add another conflict time</button></div> : null}
      {!mandatory && answer.availability === "unavailable" ? <label className="field"><span>Why are you unavailable? *</span><textarea required rows={2} maxLength={500} value={answer.unavailable_reason} onChange={(event) => update(window.id, { unavailable_reason: event.target.value })} /></label> : null}
      {!mandatory && window.collect_preferences ? <div className="conflict-preference"><label className="check-row"><input type="checkbox" checked={answer.preference_enabled} onChange={(event) => update(window.id, { preference_enabled: event.target.checked })} /><span>I have a preferred rehearsal time within this window</span></label>{answer.preference_enabled ? <div><p className="muted">Choose a preferred time within the rehearsal window shown above.</p><div className="conflict-range-row"><label className="field"><span>Prefer from</span><input type="time" required defaultValue={answer.preference_start} onChange={(event) => update(window.id, { preference_start: event.target.value })} /></label><label className="field"><span>Until</span><input type="time" required defaultValue={answer.preference_end} onChange={(event) => update(window.id, { preference_end: event.target.value })} /></label><label className="field conflict-reason"><span>Preference note (optional)</span><input maxLength={1000} value={answer.preference_notes} onChange={(event) => update(window.id, { preference_notes: event.target.value })} /></label></div></div> : null}</div> : null}
    </fieldset>;
  };

  const renderOneOff = () => calendar && occurrences.length ? <section className="conflict-one-off"><h3>Specific one-off rehearsal conflicts</h3><p className="muted">Add class trips, appointments, or other exceptions that affect one particular rehearsal. Holidays and blocked dates are not offered.</p><div className="form-row"><label className="field"><span>Choose the affected rehearsal</span><select value={selectedOccurrence} onChange={(event) => setSelectedOccurrence(event.target.value)}><option value="">Choose a date and rehearsal</option>{occurrences.filter((item) => !oneOff.some((saved) => `${saved.window_id}:${saved.occurrence_date}` === item.key)).map((item) => <option key={item.key} value={item.key}>{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${item.date}T12:00:00Z`))} · {item.window.label} · {item.window.starts_at.slice(0, 5)}–{item.window.ends_at.slice(0, 5)}</option>)}</select></label><button type="button" className="secondary" onClick={addOneOff} disabled={!selectedOccurrence}>Add one-off conflict</button></div>
    <div className="conflict-window-stack">{oneOff.map((item, index) => { const window = ordered.find((row) => row.id === item.window_id)!; return <fieldset className="conflict-window-card" key={`${item.window_id}:${item.occurrence_date}`}><legend>{new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${item.occurrence_date}T12:00:00Z`))}</legend><p><strong>{window.label} · {window.starts_at.slice(0, 5)}–{window.ends_at.slice(0, 5)}</strong></p><label className="field"><span>Conflict type</span><select value={item.availability} onChange={(event) => setOneOff((current) => current.map((row, i) => i === index ? { ...row, availability: event.target.value as OneOffConflict["availability"] } : row))}><option value="unavailable">Unavailable for the entire rehearsal</option><option value="partially_available">Partially available</option></select></label><label className="field"><span>Why are you unavailable? *</span><input required maxLength={500} value={item.unavailable_reason} onChange={(event) => setOneOff((current) => current.map((row, i) => i === index ? { ...row, unavailable_reason: event.target.value, unavailable: row.unavailable.map((part) => ({ ...part, reason: event.target.value })) } : row))} /></label>{item.availability === "partially_available" ? <div><p className="muted">Enter the full conflict time. It may extend outside rehearsal as long as the times overlap.</p><div className="conflict-range-row"><label className="field"><span>Conflict begins</span><input required type="time" defaultValue={item.unavailable[0]?.starts_at ?? ""} onChange={(event) => setOneOff((current) => current.map((row, i) => i === index ? { ...row, unavailable: [{ ...row.unavailable[0], starts_at: event.target.value }] } : row))} /></label><label className="field"><span>Conflict ends</span><input required type="time" defaultValue={item.unavailable[0]?.ends_at ?? ""} onChange={(event) => setOneOff((current) => current.map((row, i) => i === index ? { ...row, unavailable: [{ ...row.unavailable[0], ends_at: event.target.value }] } : row))} /></label></div></div> : null}<button type="button" className="secondary" onClick={() => setOneOff((current) => current.filter((_, i) => i !== index))}>Remove one-off conflict</button></fieldset>; })}</div></section> : calendar ? <p className="muted">No dated rehearsal choices fall inside the configured rehearsal period.</p> : null;

  const groups: CommitmentGroup[] = ["rehearsal", "tech", "performance", "other"];
  return <section className="conflict-response-section">
    <input type="hidden" name={name} value={serialized} /><input type="hidden" name={oneOffName} value={oneOffSerialized} />
    <div><h3>Production schedule and agreements</h3><p className="muted">Review each block in order. Required production calls use different choices from ordinary rehearsals because an unresolved conflict may affect casting.</p></div>
    {groups.map((group) => {
      const groupWindows = ordered.filter((window) => commitmentGroupForWindow(window) === group);
      const groupSections = agreementSections.filter((section) => commitmentGroupForSection(section) === group);
      if (!groupWindows.length && !groupSections.length) return null;
      return <section className="commitment-response-block" key={group}><h3>{groupLabels[group]}</h3>
        {groupWindows.length ? <div className="conflict-window-stack">{groupWindows.map(renderWindow)}</div> : null}
        {group === "rehearsal" ? renderOneOff() : null}
        {groupSections.map((section, index) => <div className="commitment-agreement" key={`${section.key}-${index}`}><h4>{section.title}</h4><div className="rich-render" dangerouslySetInnerHTML={{ __html: sanitizeRichText(section.body) }} />{section.requires_response ? <label className="check-row agreement-check"><input type="checkbox" name={`ack_${section.key}`} required /><span className="rich-render" dangerouslySetInnerHTML={{ __html: sanitizeRichText(section.acknowledgement) }} /></label> : null}</div>)}
      </section>;
    })}
  </section>;
}
