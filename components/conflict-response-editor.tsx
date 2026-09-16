"use client";

import { useMemo, useState } from "react";
import { conflictWindowSummary, type ConflictWindowAnswer, type ConflictWindowSnapshot } from "@/lib/rehearsal-conflicts";

function blank(windowId: string): ConflictWindowAnswer { return { window_id: windowId, availability: "", unavailable: [{ starts_at: "", ends_at: "", reason: "" }], preference_enabled: false, preference_start: "", preference_end: "", preference_notes: "" }; }

export function ConflictResponseEditor({ windows, name = "conflictResponses" }: { windows: ConflictWindowSnapshot[]; name?: string }) {
  const [answers, setAnswers] = useState<Record<string, ConflictWindowAnswer>>(() => Object.fromEntries(windows.map((window) => [window.id, blank(window.id)])));
  const serialized = useMemo(() => JSON.stringify(Object.values(answers).filter((answer) => answer.availability).map((answer) => ({ ...answer, unavailable: answer.availability === "unavailable" ? answer.unavailable : [] }))), [answers]);
  const update = (id: string, change: Partial<ConflictWindowAnswer>) => setAnswers((current) => ({ ...current, [id]: { ...current[id], ...change } }));
  return <section className="conflict-response-section">
    <input type="hidden" name={name} value={serialized}/>
    <div><h3>Rehearsal availability</h3><p className="muted">Answer each required window. Mark only the times you cannot attend; preferences are requests, not guaranteed call times.</p></div>
    <div className="conflict-window-stack">{windows.map((window) => { const answer = answers[window.id]; return <fieldset className="conflict-window-card" key={window.id}>
      <legend>{window.label}{window.required ? " *" : ""}</legend>
      <p><strong>{conflictWindowSummary(window)}</strong><br/><span className="muted">{window.call_type === "fixed" ? "Scheduled rehearsal call" : "Flexible rehearsal window"}{window.instructions ? ` · ${window.instructions}` : ""}</span></p>
      <label className="field"><span>My availability</span><select required={window.required} value={answer.availability} onChange={(event) => update(window.id, { availability: event.target.value as ConflictWindowAnswer["availability"] })}><option value="">Choose one</option><option value="available">I am fully available during this window</option><option value="unavailable">I have an unavailable time during this window</option></select></label>
      {answer.availability === "unavailable" ? <div className="conflict-ranges"><h4>Unavailable times</h4>{answer.unavailable.map((interval, index) => <div className="conflict-range-row" key={index}>
        <label className="field"><span>From</span><input type="time" required min={window.starts_at.slice(0,5)} max={window.ends_at.slice(0,5)} value={interval.starts_at} onChange={(event) => update(window.id, { unavailable: answer.unavailable.map((item, itemIndex) => itemIndex === index ? { ...item, starts_at: event.target.value } : item) })}/></label>
        <label className="field"><span>Until</span><input type="time" required min={window.starts_at.slice(0,5)} max={window.ends_at.slice(0,5)} value={interval.ends_at} onChange={(event) => update(window.id, { unavailable: answer.unavailable.map((item, itemIndex) => itemIndex === index ? { ...item, ends_at: event.target.value } : item) })}/></label>
        <label className="field conflict-reason"><span>Reason (optional)</span><input maxLength={500} value={interval.reason} onChange={(event) => update(window.id, { unavailable: answer.unavailable.map((item, itemIndex) => itemIndex === index ? { ...item, reason: event.target.value } : item) })}/></label>
        {answer.unavailable.length > 1 ? <button className="secondary compact-button" type="button" onClick={() => update(window.id, { unavailable: answer.unavailable.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button> : null}
      </div>)}<button className="secondary" type="button" onClick={() => update(window.id, { unavailable: [...answer.unavailable, { starts_at: "", ends_at: "", reason: "" }] })}>Add another unavailable time</button></div> : null}
      {window.collect_preferences ? <div className="conflict-preference"><label className="check-row"><input type="checkbox" checked={answer.preference_enabled} onChange={(event) => update(window.id, { preference_enabled: event.target.checked })}/><span>I have a preferred rehearsal time within this window</span></label>{answer.preference_enabled ? <div className="conflict-range-row"><label className="field"><span>Prefer from</span><input type="time" required min={window.starts_at.slice(0,5)} max={window.ends_at.slice(0,5)} value={answer.preference_start} onChange={(event) => update(window.id, { preference_start: event.target.value })}/></label><label className="field"><span>Until</span><input type="time" required min={window.starts_at.slice(0,5)} max={window.ends_at.slice(0,5)} value={answer.preference_end} onChange={(event) => update(window.id, { preference_end: event.target.value })}/></label><label className="field conflict-reason"><span>Preference note (optional)</span><input maxLength={1000} value={answer.preference_notes} onChange={(event) => update(window.id, { preference_notes: event.target.value })}/></label></div> : null}</div> : null}
    </fieldset>; })}</div>
  </section>;
}
