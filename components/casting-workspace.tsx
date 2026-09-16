"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCastingDraftAction, setCastingDraftStatusAction, prepareCastingOfferAction } from "@/app/projects/[projectId]/casting/actions";
import { companyInvitation, draftWarnings, type CastingAssignment, type CastingDraft, type CastingPerson, type CastingRole } from "@/lib/casting-drafts";
import { HtmlMessageEditor } from "@/components/html-message-editor";
import { sanitizeRichText } from "@/lib/rich-text";

type Props = { projectId: string; projectTitle: string; drafts: CastingDraft[]; people: CastingPerson[]; roles: CastingRole[]; assignments: CastingAssignment[]; applicantIds: string[] };

function DraftEditor({ draft, people, roles, applicantIds, pending, onSave }: { draft: CastingDraft | null; people: CastingPerson[]; roles: CastingRole[]; applicantIds: string[]; pending: boolean; onSave: (data: FormData) => void }) {
  const [search, setSearch] = useState("");
  const [applicantsOnly, setApplicantsOnly] = useState(true);
  const [coverage, setCoverage] = useState(draft?.coverage_type ?? "none");
  const [templateVersion, setTemplateVersion] = useState(0);
  const candidates = people.filter((person) => (!applicantsOnly || applicantIds.includes(person.id)) && `${person.full_name} ${person.email}`.toLowerCase().includes(search.toLowerCase()));
  const person = people.find((row) => row.id === draft?.person_id);
  return <form action={onSave} className="stacked-form">
    <fieldset disabled={pending} className="casting-fieldset">
      {draft ? <><input type="hidden" name="id" value={draft.id}/><input type="hidden" name="revision" value={draft.revision}/><input type="hidden" name="personId" value={draft.person_id}/><p><strong>{person?.full_name ?? "Actor"}</strong><br/>{person?.email || "Email address missing"}</p></> : <>
        <label className="field"><span>Find an actor</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or email" /></label>
        <label className="check-row"><input type="checkbox" checked={applicantsOnly} onChange={(event) => setApplicantsOnly(event.target.checked)}/><span>Only this project’s audition applicants</span></label>
        <label className="field"><span>Actor *</span><select name="personId" required defaultValue=""><option value="">Choose an actor</option>{candidates.slice(0, 100).map((row) => <option value={row.id} key={row.id}>{row.full_name} — {row.email || "No email"}</option>)}</select></label>
        <small>{candidates.length > 100 ? "Showing the first 100 matches. Narrow your search to find another actor." : `${candidates.length} matching people`}</small>
      </>}
      <label className="field"><span>Offered role *</span><select name="roleId" required defaultValue={draft?.role_id ?? ""}><option value="">Choose a role</option>{roles.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.role_group.replace(/_/g, " ")}{row.allows_multiple_assignments ? " · multiple people" : ""}</option>)}</select></label>
      <label className="field"><span>Understudy or swing</span><select name="coverageType" value={coverage} onChange={(event) => setCoverage(event.target.value as typeof coverage)}><option value="none">Not applicable</option><option value="understudy">Understudy</option><option value="swing">Swing</option></select></label>
      {coverage !== "none" ? <fieldset><legend>Roles they would cover *</legend><div className="casting-covered-roles">{roles.map((role) => <label className="check-row" key={role.id}><input type="checkbox" name="coveredRoleIds" value={role.id} defaultChecked={draft?.covered_role_ids.includes(role.id)}/><span>{role.name}</span></label>)}</div></fieldset> : null}
      <HtmlMessageEditor name="additionalDuties" label="Additional duties — visible to the actor" initialValue={draft?.additional_duties ?? ""}/>
      <HtmlMessageEditor key={templateVersion} name="actorNotes" label="Notes to include with this offer" initialValue={templateVersion ? `<p>${companyInvitation}</p>` : draft?.actor_notes ?? ""}/>
      <button className="secondary" type="button" onClick={() => { if (window.confirm("Replace the offer notes with the Ensemble company invitation?")) setTemplateVersion((value) => value + 1); }}>Use Ensemble company invitation</button>
      <p className="muted">These are proposed casting details. Saving does not send an offer, reserve a role, or start onboarding.</p>
      <button type="submit">{pending ? "Saving…" : "Save casting draft"}</button>
    </fieldset>
  </form>;
}

export function CastingWorkspace(props: Props) {
  const { projectId, projectTitle, drafts, people, roles, assignments, applicantIds } = props;
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<CastingDraft | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [showWithdrawn, setShowWithdrawn] = useState(false);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
    if (!selected && dialog.current?.open) dialog.current.close();
  }, [selected]);
  const active = drafts.filter((draft) => draft.status === "draft");
  const visible = drafts.filter((draft) => (showWithdrawn || draft.status === "draft") && `${people.find((row) => row.id === draft.person_id)?.full_name ?? ""} ${roles.find((row) => row.id === draft.role_id)?.name ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const selectedDraft = selected && selected !== "new" ? selected : null;
  function open(draft: CastingDraft | "new") { setSelected(draft); setPreview(false); setMessage({}); }
  function save(data: FormData) {
    data.set("projectId", projectId);
    startTransition(async () => {
      try {
        const result = await saveCastingDraftAction(data);
        setMessage(result);
        if (result.success) { setSelected(null); router.refresh(); }
      } catch { setMessage({ error: "The save could not be confirmed. Your entries are still here; reopen the casting list to check before trying again." }); }
    });
  }
  function changeStatus(draft: CastingDraft) {
    const data = new FormData();
    Object.entries({ projectId, id: draft.id, revision: String(draft.revision), status: draft.status === "draft" ? "withdrawn" : "draft" }).forEach(([key, value]) => data.set(key, value));
    startTransition(async () => {
      try {
        const result = await setCastingDraftStatusAction(data);
        setMessage(result);
        if (result.success) { setSelected(null); router.refresh(); }
      } catch { setMessage({ error: "The change could not be confirmed. Please reload to check its status." }); }
    });
  }
  function prepare(draft: CastingDraft) {
    if (!window.confirm("Prepare an agreement from these saved details and the current project schedules? No email will be sent. Later draft changes will invalidate this link.")) return;
    const data = new FormData();
    Object.entries({ projectId, id: draft.id, revision: String(draft.revision) }).forEach(([key, value]) => data.set(key, value));
    startTransition(async () => {
      try { const result = await prepareCastingOfferAction(data); setMessage(result); if (result.success) { setSelected(null); router.refresh(); } }
      catch { setMessage({ error: "Agreement preparation could not be confirmed. Reload before trying again." }); }
    });
  }
  const notices = <>{message.error ? <p className="setup-warning" role="alert">{message.error}</p> : null}{message.success ? <p className="setup-success" role="status">{message.success}</p> : null}</>;
  return <>
    <section className="panel">
      <div className="section-heading"><div><h2>Prepare the company</h2><p>{active.length} proposed role{active.length === 1 ? "" : "s"} · {new Set(active.map((row) => row.person_id)).size} people</p></div><button type="button" onClick={() => open("new")} disabled={!roles.length}>Add casting draft</button></div>
      <p className="muted">Prepare a secure agreement from a saved draft. Actor responses wait for your release before official assignment and onboarding. Changing a prepared draft invalidates its previous link and requires fresh acceptance.</p>
      {!roles.length ? <p>Create the project’s roles in Roles & Assignments first.</p> : null}
      {!selected ? notices : null}
      <div className="people-directory-tools"><label className="field"><span>Search cast or role</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="check-row"><input type="checkbox" checked={showWithdrawn} onChange={(event) => setShowWithdrawn(event.target.checked)}/><span>Include withdrawn drafts</span></label></div>
      <div className="casting-list">{visible.map((draft) => {
        const person = people.find((row) => row.id === draft.person_id);
        const role = roles.find((row) => row.id === draft.role_id);
        const warnings = draftWarnings(draft, people, roles, drafts, assignments);
        return <button className="casting-row" type="button" key={draft.id} onClick={() => open(draft)}><span><strong>{person?.full_name ?? "Person unavailable"}</strong><small>{person?.email || "Email missing"}</small></span><span>{role?.name ?? "Role unavailable"}{draft.coverage_type !== "none" ? ` · ${draft.coverage_type}` : ""}</span><span>{draft.status === "withdrawn" ? "Withdrawn" : "Draft"}{draft.status === "draft" && warnings.length ? <small className="casting-warning">{warnings.join(" · ")}</small> : null}</span><span aria-hidden="true">→</span></button>;
      })}{!visible.length ? <p className="empty-state">No casting drafts match. Add an actor to start preparing the company.</p> : null}</div>
    </section>
    <dialog ref={dialog} className="casting-dialog" aria-labelledby="casting-drawer-title" onCancel={(event) => { if (pending) event.preventDefault(); else setSelected(null); }} onClose={() => setSelected(null)}>
      <header className="people-drawer-header"><h2 id="casting-drawer-title">{selectedDraft ? "Casting draft" : "Add casting draft"}</h2><button type="button" className="drawer-close" aria-label="Close casting draft" disabled={pending} onClick={() => setSelected(null)}>×</button></header>
      <div className="people-drawer-body">{notices}
        {selectedDraft?.status === "draft" ? <button type="button" className="secondary" disabled={pending} onClick={() => prepare(selectedDraft)}>{pending ? "Preparing…" : "Prepare agreement from saved draft"}</button> : null}
        {selectedDraft ? <div className="top-actions"><button type="button" className="secondary" disabled={pending} onClick={() => setPreview((value) => !value)}>{preview ? "Edit draft" : "Preview saved offer details"}</button><button type="button" className="secondary" disabled={pending} onClick={() => changeStatus(selectedDraft)}>{pending ? "Saving…" : selectedDraft.status === "draft" ? "Withdraw draft" : "Restore draft"}</button></div> : null}
        {selectedDraft && (preview || selectedDraft.status === "withdrawn") ? <section className="casting-preview"><p className="eyebrow">{projectTitle} · Draft preview</p><h2>{people.find((row) => row.id === selectedDraft.person_id)?.full_name}</h2><p>Proposed role: <strong>{roles.find((row) => row.id === selectedDraft.role_id)?.name}</strong></p>{selectedDraft.coverage_type !== "none" ? <p>{selectedDraft.coverage_type === "swing" ? "Swing" : "Understudy"} covering: {roles.filter((row) => selectedDraft.covered_role_ids.includes(row.id)).map((row) => row.name).join(", ")}</p> : null}{selectedDraft.additional_duties ? <><h3>Additional duties</h3><div className="rich-render" dangerouslySetInnerHTML={{ __html: sanitizeRichText(selectedDraft.additional_duties) }}/></> : null}<div className="rich-render" dangerouslySetInnerHTML={{ __html: sanitizeRichText(selectedDraft.actor_notes) }}/><p className="muted">Offer details only. The complete agreement and email preview will be added before sending is enabled.</p></section> : selected ? <DraftEditor key={selectedDraft?.id ?? "new"} draft={selectedDraft} people={people} roles={roles} applicantIds={applicantIds} pending={pending} onSave={save}/> : null}
      </div>
    </dialog>
  </>;
}
