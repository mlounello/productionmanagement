"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { addPersonNoteAction } from "@/app/projects/[projectId]/actions";
import { updatePersonDirectoryAction } from "@/app/people/actions";
import { StatusBadge } from "@/components/ui/status-badge";

export type DirectoryRole = { id: string; name: string; group: string; status: string; projectTitle?: string; guestArtist?: boolean };
export type DirectoryNote = { id: string; note: string; visibility: string; pinned: boolean };
export type DirectoryPerson = {
  id: string; fullName: string; firstName: string; middleName: string; lastName: string; preferredName: string; pronouns: string;
  email: string; vendorNumber: string; phone: string; affiliation: string; personType: string; status: string;
  headshotUrl: string; managementNotes: string; noteCount: number; projectCount: number; roles: DirectoryRole[]; notes: DirectoryNote[];
};

function label(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

function PersonAvatar({ person, large = false }: { person: DirectoryPerson; large?: boolean }) {
  return <span
    aria-hidden="true"
    className={`directory-avatar${large ? " large" : ""}${person.headshotUrl ? " has-image" : ""}`}
    style={person.headshotUrl ? { backgroundImage: `url(${JSON.stringify(person.headshotUrl)})` } : undefined}
  >{person.headshotUrl ? null : (person.preferredName || person.fullName).slice(0, 1).toUpperCase()}</span>;
}

export function PeopleDirectory({ people, returnTo, projectId }: { people: DirectoryPerson[]; returnTo: string; projectId?: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState(""); const [group, setGroup] = useState(""); const [type, setType] = useState(""); const [status, setStatus] = useState("active");
  const selected = people.find((person) => person.id === selectedId) ?? null;
  const groups = useMemo(() => [...new Set(people.flatMap((person) => person.roles.map((role) => role.group)).filter(Boolean))].sort(), [people]);
  const types = useMemo(() => [...new Set(people.map((person) => person.personType).filter(Boolean))].sort(), [people]);
  const visible = useMemo(() => people.filter((person) => {
    const haystack = [person.fullName, person.preferredName, person.pronouns, person.email, person.vendorNumber, person.phone, person.affiliation, ...person.roles.flatMap((role) => [role.name, role.group, role.projectTitle ?? ""])].join(" ").toLowerCase();
    return (!search || haystack.includes(search.toLowerCase())) && (!group || person.roles.some((role) => role.group === group)) && (!type || person.personType === type) && (!status || person.status === status);
  }), [people, search, group, type, status]);
  useEffect(() => {
    function close(event: KeyboardEvent) { if (event.key === "Escape") setSelectedId(null); }
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, []);

  return <div className={`people-directory${selected ? " drawer-open" : ""}`}>
    <div className="people-directory-tools">
      <label className="field"><span>Search</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, role, 90#…" /></label>
      <label className="field"><span>Role group</span><select value={group} onChange={(event) => setGroup(event.target.value)}><option value="">All groups</option>{groups.map((item)=><option value={item} key={item}>{label(item)}</option>)}</select></label>
      <label className="field"><span>Person type</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="">All types</option>{types.map((item)=><option value={item} key={item}>{label(item)}</option>)}</select></label>
      <label className="field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></label>
      <button className="button secondary" type="button" onClick={() => { setSearch(""); setGroup(""); setType(""); setStatus("active"); }}>Reset</button>
    </div>
    <p className="muted people-directory-count">{visible.length} of {people.length} people · Select a row to view or edit</p>
    <div className="people-directory-table" role="table" aria-label={projectId ? "Project team" : "People database"}>
      <div className="people-directory-header" role="row"><span>Name</span><span>Affiliation</span><span>Roles</span><span>Groups</span><span>Email</span><span>Status</span></div>
      {visible.length ? visible.map((person) => <button type="button" className={`people-directory-row${selectedId === person.id ? " selected" : ""}`} onClick={() => setSelectedId(person.id)} role="row" key={person.id}>
        <span className="directory-name"><PersonAvatar person={person}/><strong>{person.fullName}{person.pronouns ? ` (${person.pronouns})` : ""}</strong></span>
        <span>{person.affiliation || "—"}</span><span>{person.roles.map((role) => role.name).join(", ") || "—"}</span><span>{[...new Set(person.roles.map((role) => label(role.group)))].join(", ") || "—"}</span><span>{person.email || "—"}</span><span><StatusBadge status={person.status}/></span>
      </button>) : <div className="empty-state">No people match these filters.</div>}
    </div>

    {selected ? <aside className="people-drawer" role="dialog" aria-label={`${selected.fullName} details`} aria-modal="false">
      <header className="people-drawer-header"><div className="directory-name"><PersonAvatar person={selected} large/><div><strong>{selected.fullName}</strong><span>{selected.roles.map((role)=>role.name).join(", ") || label(selected.personType)}</span></div></div><button className="drawer-close" type="button" onClick={() => setSelectedId(null)} aria-label="Close person details">×</button></header>
      <div className="people-drawer-body">
        <form action={updatePersonDirectoryAction} className="stacked-form" key={selected.id}><input type="hidden" name="id" value={selected.id}/><input type="hidden" name="returnTo" value={returnTo}/>
          <details className="drawer-section" open><summary>Identity</summary><label className="field"><span>Full name</span><input name="fullName" defaultValue={selected.fullName} required/></label><div className="form-row"><label className="field"><span>First name</span><input name="firstName" defaultValue={selected.firstName}/></label><label className="field"><span>Middle name</span><input name="middleName" defaultValue={selected.middleName}/></label></div><div className="form-row"><label className="field"><span>Last name</span><input name="lastName" defaultValue={selected.lastName}/></label><label className="field"><span>Preferred name</span><input name="preferredName" defaultValue={selected.preferredName}/></label></div><label className="field"><span>Pronouns</span><input name="pronouns" defaultValue={selected.pronouns}/></label></details>
          <details className="drawer-section" open><summary>Contact & classification</summary><label className="field"><span>Email</span><input type="email" name="email" defaultValue={selected.email}/></label><div className="form-row"><label className="field"><span>Phone</span><input name="phone" defaultValue={selected.phone}/></label><label className="field"><span>Vendor / 90#</span><input name="vendorNumber" defaultValue={selected.vendorNumber}/></label></div><label className="field"><span>Affiliation</span><input name="affiliation" defaultValue={selected.affiliation}/></label><div className="form-row"><label className="field"><span>Person type</span><select name="personType" defaultValue={selected.personType}><option value="person">Person</option><option value="student">Student</option><option value="staff">Staff</option><option value="faculty">Faculty</option><option value="guest_artist">Guest artist</option><option value="vendor_contact">Vendor contact</option><option value="client">Client</option></select></label><label className="field"><span>Status</span><select name="status" defaultValue={selected.status}><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></label></div></details>
          <details className="drawer-section"><summary>Management-only profile notes</summary><label className="field"><span>Only authorized staff can see this</span><textarea name="managementNotes" rows={5} defaultValue={selected.managementNotes}/></label></details>
          <button type="submit">Save person</button>
        </form>
        <section className="drawer-section static"><h3>{projectId ? "Project roles" : "Project history"}</h3><div className="compact-list">{selected.roles.length ? selected.roles.map((role)=><div className="compact-row" key={role.id}><div><strong>{role.name}</strong><span>{role.projectTitle ? `${role.projectTitle} · ` : ""}{label(role.group)}{role.guestArtist ? " · Guest Artist" : ""}</span></div><StatusBadge status={role.status}/></div>) : <p className="muted">No roles on file.</p>}</div></section>
        {projectId ? <section className="drawer-section static"><h3>Project notes</h3><div className="compact-list">{selected.notes.length ? selected.notes.map((note)=><div className="compact-row" key={note.id}><div><strong>{note.pinned ? "Pinned · " : ""}{note.visibility === "client_visible" ? "Client visible" : "Management only"}</strong><span>{note.note}</span></div></div>) : <p className="muted">No project notes yet.</p>}</div><form action={addPersonNoteAction} className="stacked-form"><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="personId" value={selected.id}/><label className="field"><span>Visibility</span><select name="visibility" defaultValue="internal"><option value="internal">Management only</option><option value="client_visible">Client visible</option></select></label><label className="field"><span>New note</span><textarea name="note" rows={3} required/></label><label className="check-row"><input type="checkbox" name="isPinned"/><span>Pin this note</span></label><button type="submit" className="button secondary">Add note</button></form></section> : <section className="drawer-section static"><h3>Record summary</h3><p className="muted">{selected.roles.length} role{selected.roles.length===1?"":"s"} · {selected.projectCount} project{selected.projectCount===1?"":"s"} · {selected.noteCount} note{selected.noteCount===1?"":"s"}</p></section>}
        <div className="drawer-footer"><Link className="button secondary" href={`/people/${selected.id}`}>Open full profile, bio & headshot</Link></div>
      </div>
    </aside> : null}
  </div>;
}
