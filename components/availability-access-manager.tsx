"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { grantAvailabilityViewerAction, removeAvailabilityViewerAction } from "@/app/projects/[projectId]/availability/actions";

type Person = { id: string; name: string; email: string };
type Viewer = Person & { active: boolean };

export function AvailabilityAccessManager({ projectId, candidates, viewers }: { projectId: string; candidates: Person[]; viewers: Viewer[] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  const router = useRouter();
  const run = (action: (data: FormData) => Promise<{ error?: string; success?: string }>, data: FormData) => startTransition(async () => { const result = await action(data); setMessage(result); if (result.success) router.refresh(); });
  return <details className="panel availability-access-panel no-print"><summary><span><strong>Director and stage-management access</strong><small>Invite a read-only viewer using their existing person profile.</small></span></summary><div className="availability-access-body">
    {message.error ? <p className="setup-warning" role="alert">{message.error}</p> : null}{message.success ? <p className="setup-success" role="status">{message.success}</p> : null}
    <form className="form-row" action={(data) => run(grantAvailabilityViewerAction, data)}><input type="hidden" name="projectId" value={projectId}/><label className="field"><span>Company member</span><select name="personId" required defaultValue=""><option value="">Choose a person</option>{candidates.map((person) => <option value={person.id} key={person.id}>{person.name} · {person.email || "No email"}</option>)}</select><small>The invitation opens this viewer directly. No password or new account is required.</small></label><button disabled={pending}>{pending ? "Sending…" : "Grant access & send invitation"}</button></form>
    <div className="compact-list">{viewers.filter((viewer) => viewer.active).map((viewer) => <div className="compact-row" key={viewer.id}><div><strong>{viewer.name}</strong><span>{viewer.email} · read-only Company Availability</span></div><form action={(data) => run(removeAvailabilityViewerAction, data)}><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="personId" value={viewer.id}/><button className="danger" disabled={pending}>Remove access</button></form></div>)}{!viewers.some((viewer) => viewer.active) ? <p className="muted">No dedicated viewers have been invited yet. Existing project staff retain access.</p> : null}</div>
  </div></details>;
}
