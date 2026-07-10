"use client";

import { useState } from "react";

type Option = { id: string; label: string };
type AssignmentKind = "primary" | "shared" | "understudy" | "alternate";
type RegularRow = { key: number; roleId: string; personId: string; assignmentKind: AssignmentKind; isGuestArtist: boolean };
type BudgetRow = { key: number; roleId: string; guestArtistId: string; assignmentKind: AssignmentKind };

const kinds: Array<{ value: AssignmentKind; label: string }> = [
  { value: "primary", label: "Primary" },
  { value: "shared", label: "Shared role" },
  { value: "understudy", label: "Understudy" },
  { value: "alternate", label: "Alternate" }
];

export function BulkAssignmentForms({
  projectId,
  roles,
  people,
  guestArtists,
  regularAction,
  budgetAction
}: {
  projectId: string;
  roles: Option[];
  people: Option[];
  guestArtists: Option[];
  regularAction: (formData: FormData) => void | Promise<void>;
  budgetAction: (formData: FormData) => void | Promise<void>;
}) {
  const [nextKey, setNextKey] = useState(2);
  const [regularRows, setRegularRows] = useState<RegularRow[]>([
    { key: 1, roleId: "", personId: "", assignmentKind: "primary", isGuestArtist: false }
  ]);
  const [budgetRows, setBudgetRows] = useState<BudgetRow[]>([
    { key: 1, roleId: "", guestArtistId: "", assignmentKind: "primary" }
  ]);
  const addRegular = () => {
    setRegularRows((rows) => [...rows, { key: nextKey, roleId: "", personId: "", assignmentKind: "primary", isGuestArtist: false }]);
    setNextKey((value) => value + 1);
  };
  const addBudget = () => {
    setBudgetRows((rows) => [...rows, { key: nextKey, roleId: "", guestArtistId: "", assignmentKind: "primary" }]);
    setNextKey((value) => value + 1);
  };

  return (
    <div className="grid two">
      <details className="integration-panel" open>
        <summary><strong>Assign existing people</strong><span>Add several role assignments in one submit.</span></summary>
        <form action={regularAction} className="stacked-form">
          <input name="projectId" type="hidden" value={projectId} />
          <input name="rowsJson" type="hidden" value={JSON.stringify(regularRows)} />
          {regularRows.map((row) => (
            <div className="assignment-create-form" key={`regular-${row.key}`}>
              <select aria-label="Role" value={row.roleId} onChange={(event) => setRegularRows((rows) => rows.map((item) => item.key === row.key ? { ...item, roleId: event.target.value } : item))} required>
                <option value="">Choose role</option>{roles.filter((option) => !regularRows.some((item) => item.key !== row.key && item.roleId === option.id)).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <select aria-label="Person" value={row.personId} onChange={(event) => setRegularRows((rows) => rows.map((item) => item.key === row.key ? { ...item, personId: event.target.value } : item))} required>
                <option value="">Choose person</option>{people.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <select aria-label="Assignment type" value={row.assignmentKind} onChange={(event) => setRegularRows((rows) => rows.map((item) => item.key === row.key ? { ...item, assignmentKind: event.target.value as AssignmentKind } : item))}>
                {kinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
              </select>
              <label className="checkbox-inline"><input type="checkbox" checked={row.isGuestArtist} onChange={(event) => setRegularRows((rows) => rows.map((item) => item.key === row.key ? { ...item, isGuestArtist: event.target.checked } : item))} /><span>Guest artist</span></label>
              {regularRows.length > 1 ? <button className="button secondary" type="button" onClick={() => setRegularRows((rows) => rows.filter((item) => item.key !== row.key))}>Remove</button> : null}
            </div>
          ))}
          <div className="form-actions"><button className="button secondary" type="button" onClick={addRegular}>Add another entry</button><button type="submit">Assign {regularRows.length}</button></div>
        </form>
      </details>

      <details className="integration-panel" open>
        <summary><strong>Assign from Theatre Budget</strong><span>Link several existing guest artists in one submit.</span></summary>
        <form action={budgetAction} className="stacked-form">
          <input name="projectId" type="hidden" value={projectId} />
          <input name="rowsJson" type="hidden" value={JSON.stringify(budgetRows)} />
          {budgetRows.map((row) => (
            <div className="assignment-create-form" key={`budget-${row.key}`}>
              <select aria-label="Theatre Budget guest artist" value={row.guestArtistId} onChange={(event) => setBudgetRows((rows) => rows.map((item) => item.key === row.key ? { ...item, guestArtistId: event.target.value } : item))} required>
                <option value="">Choose guest artist</option>{guestArtists.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <select aria-label="Project role" value={row.roleId} onChange={(event) => setBudgetRows((rows) => rows.map((item) => item.key === row.key ? { ...item, roleId: event.target.value } : item))} required>
                <option value="">Choose role</option>{roles.filter((option) => !budgetRows.some((item) => item.key !== row.key && item.roleId === option.id)).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <select aria-label="Assignment type" value={row.assignmentKind} onChange={(event) => setBudgetRows((rows) => rows.map((item) => item.key === row.key ? { ...item, assignmentKind: event.target.value as AssignmentKind } : item))}>
                {kinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
              </select>
              {budgetRows.length > 1 ? <button className="button secondary" type="button" onClick={() => setBudgetRows((rows) => rows.filter((item) => item.key !== row.key))}>Remove</button> : null}
            </div>
          ))}
          <div className="form-actions"><button className="button secondary" type="button" onClick={addBudget}>Add another entry</button><button type="submit">Assign and link {budgetRows.length}</button></div>
        </form>
      </details>
    </div>
  );
}
