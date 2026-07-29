"use client";

import { useMemo, useState } from "react";

type Option = { id: string; label: string };
type PersonOption = Option & { isSienaEmployee: boolean };

export function AssignmentCreateForm({
  action,
  projectId,
  roles,
  people
}: {
  action: (formData: FormData) => void | Promise<void>;
  projectId: string;
  roles: Option[];
  people: PersonOption[];
}) {
  const [personId, setPersonId] = useState("");
  const [isGuestArtist, setIsGuestArtist] = useState(false);
  const selectedPerson = useMemo(
    () => people.find((person) => person.id === personId),
    [people, personId]
  );
  const isSienaEmployee = Boolean(selectedPerson?.isSienaEmployee);
  const confirmationExempt = isGuestArtist || isSienaEmployee;

  return (
    <form action={action} className="assignment-create-form">
      <input name="projectId" type="hidden" value={projectId} />
      <label className="field">
        <span>Role</span>
        <select name="roleId" defaultValue="" required>
          <option value="">Choose role</option>
          {roles.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Person</span>
        <select name="personId" value={personId} onChange={(event) => setPersonId(event.target.value)} required>
          <option value="">Choose person</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.label}</option>)}
        </select>
      </label>
      {confirmationExempt ? (
        <label className="field">
          <span>Status</span>
          <input name="status" type="hidden" value={isSienaEmployee ? "accepted" : "draft"} />
          <input value={isSienaEmployee ? "Accepted — Siena employment" : "Controlled by Theatre Budget contract"} readOnly />
        </label>
      ) : (
        <label className="field">
          <span>Status</span>
          <select name="status" defaultValue="draft">
            <option value="draft">Draft</option>
            <option value="offered">Offered</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </label>
      )}
      <label className="field">
        <span>Assignment type</span>
        <select name="assignmentKind" defaultValue="primary">
          <option value="primary">Primary</option>
          <option value="shared">Shared role</option>
          <option value="understudy">Understudy</option>
          <option value="alternate">Alternate</option>
        </select>
      </label>
      {confirmationExempt ? (
        <label className="field">
          <span>Role confirmation</span>
          <input name="confirmationStatus" type="hidden" value="not_required" />
          <input value="Not required" readOnly />
          <small>{isGuestArtist ? "The Theatre Budget contract is the acceptance record." : "Siena employment is the acceptance record."}</small>
        </label>
      ) : (
        <label className="field">
          <span>Confirmation</span>
          <select name="confirmationStatus" defaultValue="not_sent">
            <option value="not_sent">Not sent</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
            <option value="bounced">Bounced</option>
          </select>
        </label>
      )}
      <label className="checkbox-card">
        <input name="isGuestArtist" type="checkbox" checked={isGuestArtist} onChange={(event) => setIsGuestArtist(event.target.checked)} />
        <span>
          <strong>Is Guest Artist</strong>
          <small>Uses the Theatre Budget contract instead of a separate role offer or confirmation.</small>
        </span>
      </label>
      <label className="field assignment-notes-field">
        <span>Assignment notes</span>
        <textarea name="notes" rows={2} />
      </label>
      <button type="submit">Assign person</button>
    </form>
  );
}
