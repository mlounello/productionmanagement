"use client";

import { useEffect, useMemo, useState } from "react";
import {
  refreshPublicityFromProfileAction,
  requestPublicityApprovalAction,
  retryPublicitySyncAction,
  saveProjectPublicityCopyAction,
  sendBulkPublicityRemindersAction,
  sendPublicityReminderAction,
  setBioRequiredAction
} from "@/app/projects/[projectId]/publicity/actions";
import { PublicityBioField, PublicityBioPreview } from "@/components/publicity-bio-field";
import { StatusBadge } from "@/components/ui/status-badge";

export type PublicityDirectoryPerson = {
  personId: string;
  submissionId: string | null;
  name: string;
  email: string;
  roles: string[];
  profileConnected: boolean;
  profileChanged: boolean;
  creditedName: string;
  bio: string;
  headshotUrl: string;
  status: string;
  playbillStatus: string;
  playbillSyncStatus: string;
  playbillSyncError: string;
  lastReminderSentAt: string | null;
  reminderCount: number;
  bioRequired: boolean;
};

function title(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function needsFor(person: PublicityDirectoryPerson) {
  if (!person.submissionId) return ["Publicity record"];
  if (!person.bioRequired || person.playbillStatus === "locked") return [];
  return [
    !person.bio.trim() ? "Bio" : null,
    !person.headshotUrl.trim() ? "Headshot" : null,
    !["person_approved", "approved"].includes(person.status) ? "Approval" : null
  ].filter(Boolean) as string[];
}

function filterMatches(person: PublicityDirectoryPerson, filter: string) {
  const needs = needsFor(person);
  if (filter === "attention") return needs.length > 0;
  if (filter === "missing_bio") return needs.includes("Bio");
  if (filter === "missing_headshot") return needs.includes("Headshot");
  if (filter === "awaiting_approval") return needs.includes("Approval") && !needs.includes("Bio");
  if (filter === "submitted") return person.playbillStatus === "submitted";
  if (filter === "approved") return person.playbillStatus === "approved";
  if (filter === "locked") return person.playbillStatus === "locked";
  if (filter === "not_required") return !person.bioRequired;
  return true;
}

export function PublicityDirectory({
  projectId,
  people,
  characterLimit,
  remindersEnabled
}: {
  projectId: string;
  people: PublicityDirectoryPerson[];
  characterLimit: number;
  remindersEnabled: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("attention");
  const [reminderIds, setReminderIds] = useState<Set<string>>(new Set());
  const selected = people.find((person) => person.personId === selectedId) ?? null;
  const visible = useMemo(() => people.filter((person) => {
    const haystack = [person.name, person.email, ...person.roles, person.status, person.playbillStatus].join(" ").toLowerCase();
    return (!search || haystack.includes(search.toLowerCase())) && filterMatches(person, filter);
  }), [people, search, filter]);
  const visibleOutstanding = visible.filter((person) => person.submissionId && person.bioRequired && person.playbillStatus !== "locked" && needsFor(person).length);

  useEffect(() => {
    function close(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedId(null);
    }
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  function toggleReminder(personId: string) {
    setReminderIds((current) => {
      const next = new Set(current);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }

  function selectVisible() {
    setReminderIds(new Set(visibleOutstanding.map((person) => person.personId)));
  }

  return <section className="panel workspace-section publicity-directory">
    <div className="section-heading">
      <div>
        <p className="eyebrow">People &amp; Status</p>
        <h2>Production publicity</h2>
        <p className="muted">Filter the list, select reminder recipients, or open a person to review and edit their production copy.</p>
      </div>
    </div>

    <div className="publicity-directory-tools">
      <label className="field"><span>Search</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, or role…" /></label>
      <label className="field"><span>Status</span><select value={filter} onChange={(event) => setFilter(event.target.value)}>
        <option value="attention">Needs attention</option>
        <option value="all">Everyone</option>
        <option value="missing_bio">Missing bio</option>
        <option value="missing_headshot">Missing headshot</option>
        <option value="awaiting_approval">Waiting for approval</option>
        <option value="submitted">Submitted to Playbill</option>
        <option value="approved">Playbill approved</option>
        <option value="locked">Final &amp; locked</option>
        <option value="not_required">Bio not required</option>
      </select></label>
      <button type="button" className="button secondary" onClick={() => { setSearch(""); setFilter("attention"); }}>Reset</button>
    </div>

    <form action={sendBulkPublicityRemindersAction} className="publicity-bulk-bar">
      <input type="hidden" name="projectId" value={projectId}/>
      {[...reminderIds].map((personId) => <input type="hidden" name="personId" value={personId} key={personId}/>)}
      <div><strong>{reminderIds.size} selected</strong><span>{remindersEnabled ? "Reminders cover every outstanding item for each selected person." : "Publicity reminders are disabled in settings."}</span></div>
      <button type="button" className="button secondary" onClick={selectVisible} disabled={!visibleOutstanding.length}>Select visible</button>
      <button type="button" className="button secondary" onClick={() => setReminderIds(new Set())} disabled={!reminderIds.size}>Clear</button>
      <button type="submit" disabled={!reminderIds.size || !remindersEnabled}>Send reminders</button>
    </form>

    <p className="muted people-directory-count">{visible.length} of {people.length} people · Select a row to open details</p>
    <div className="publicity-table" role="table" aria-label="Production publicity status">
      <div className="publicity-table-header" role="row"><span>Remind</span><span>Name</span><span>Role</span><span>Needs</span><span>Person status</span><span>Playbill</span></div>
      {visible.length ? visible.map((person) => {
        const needs = needsFor(person);
        const canRemind = Boolean(person.submissionId && person.bioRequired && person.playbillStatus !== "locked" && needs.length);
        return <div className={`publicity-table-row${selectedId === person.personId ? " selected" : ""}`} role="row" key={person.personId}>
          <label className="publicity-reminder-check" title={canRemind ? "Include in the next reminder send" : "No reminder is needed"}>
            <input type="checkbox" checked={reminderIds.has(person.personId)} disabled={!canRemind || !remindersEnabled} onChange={() => toggleReminder(person.personId)}/>
          </label>
          <button type="button" className="publicity-row-open" onClick={() => setSelectedId(person.personId)}>
            <span><strong>{person.name}</strong><small>{person.email || "No email on file"}</small></span>
            <span>{person.roles.join(", ") || "Role not listed"}</span>
            <span className="badge-row">{needs.length ? needs.map((need) => <StatusBadge status={need === "Approval" ? "pending" : "missing"} label={need} key={need}/>) : <StatusBadge status={person.bioRequired ? "ready" : "not_required"} label={person.bioRequired ? "Current" : "Not required"}/>}</span>
            <span><StatusBadge status={person.status} context="publicity"/></span>
            <span><StatusBadge status={person.playbillStatus} context="playbill"/></span>
          </button>
        </div>;
      }) : <div className="empty-state">No people match these filters.</div>}
    </div>

    {selected ? <div className="template-preview-backdrop publicity-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedId(null); }}>
      <aside className="template-preview-drawer publicity-detail-drawer" role="dialog" aria-modal="true" aria-label={`${selected.name} publicity details`}>
        <header className="drawer-header"><div><p className="eyebrow">Production Publicity</p><h2>{selected.name}</h2><p className="muted">{selected.roles.join(", ") || "Role not listed"} · {selected.email || "No email"}</p></div><button type="button" className="button secondary" onClick={() => setSelectedId(null)}>Close</button></header>
        <div className="badge-row publicity-drawer-status">
          <StatusBadge status={selected.profileConnected ? "linked" : "pending"} label={selected.profileConnected ? "Profile connected" : "Profile not connected"}/>
          {selected.profileChanged && selected.bioRequired && selected.playbillStatus !== "locked" ? <StatusBadge status="pending" label="Reusable profile has newer bio"/> : null}
          <StatusBadge status={selected.bioRequired ? selected.status : "not_required"} context="publicity" label={selected.bioRequired ? `Person: ${title(selected.status)}` : "Bio not required"}/>
          {selected.bioRequired ? <StatusBadge status={selected.playbillStatus} context="playbill" label={`Playbill: ${title(selected.playbillStatus)}`}/> : null}
        </div>

        {!selected.submissionId ? <section className="drawer-section static"><h3>Publicity record missing</h3><p className="setup-warning">Use “Repair any missing copies” in Publicity settings. Existing production copies will not be overwritten.</p></section> : <>
          {selected.playbillSyncError ? <p className="setup-warning">{selected.playbillSyncError}</p> : null}
          {!selected.bioRequired ? <section className="drawer-section static"><h3>No bio required</h3><p className="muted">This person is excluded from publicity totals and reminders for this production.</p></section> : selected.playbillStatus === "locked" ? <section className="drawer-section static"><h3>Final production copy</h3><PublicityBioPreview bio={selected.bio} name={selected.creditedName} role={selected.roles.join(", ") || "Production role"}/></section> : <form action={saveProjectPublicityCopyAction} className="stacked-form">
            <input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="submissionId" value={selected.submissionId}/>
            <label className="field"><span>Credited name</span><input name="creditedName" defaultValue={selected.creditedName} required/></label>
            <PublicityBioField name="bio" label="Production bio" initialValue={selected.bio} previewName={selected.creditedName} previewRole={selected.roles.join(", ") || "Production role"} characterLimit={characterLimit} compact/>
            <label className="field"><span>Production headshot URL</span><input name="headshotUrl" type="url" defaultValue={selected.headshotUrl} placeholder="https://…"/></label>
            <button type="submit">Save production copy</button>
          </form>}

          <section className="drawer-section static publicity-drawer-actions">
            <h3>Actions</h3>
            <div className="top-actions">
              {selected.bioRequired && selected.playbillStatus !== "locked" ? <form action={refreshPublicityFromProfileAction}><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="submissionId" value={selected.submissionId}/><button className="button secondary" type="submit">Refresh from profile</button></form> : null}
              {selected.bioRequired && selected.playbillStatus !== "locked" && ["draft", "changes_requested"].includes(selected.status) ? <form action={requestPublicityApprovalAction}><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="submissionId" value={selected.submissionId}/><button type="submit">Request person approval</button></form> : null}
              {selected.bioRequired && selected.playbillStatus !== "locked" && ["person_approved", "approved"].includes(selected.status) && selected.playbillSyncStatus !== "synced" ? <form action={retryPublicitySyncAction}><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="submissionId" value={selected.submissionId}/><button type="submit">Retry Playbill submission</button></form> : null}
              {selected.bioRequired && selected.playbillStatus !== "locked" && needsFor(selected).length ? <form action={sendPublicityReminderAction}><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="personId" value={selected.personId}/><button className="button secondary" type="submit" disabled={!remindersEnabled}>Send reminder</button></form> : null}
              {selected.playbillStatus !== "locked" ? <form action={setBioRequiredAction}><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="submissionId" value={selected.submissionId}/><input type="hidden" name="bioRequired" value={selected.bioRequired ? "false" : "true"}/><button className="button secondary" type="submit">{selected.bioRequired ? "Mark bio not required" : "Require bio"}</button></form> : null}
            </div>
            {selected.lastReminderSentAt ? <p className="muted">{selected.reminderCount} reminder{selected.reminderCount === 1 ? "" : "s"} sent · Last {new Date(selected.lastReminderSentAt).toLocaleString("en-US")}</p> : <p className="muted">No publicity reminder has been sent yet.</p>}
          </section>
        </>}
      </aside>
    </div> : null}
  </section>;
}
