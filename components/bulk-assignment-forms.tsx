"use client";

import { useId, useMemo, useState } from "react";

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

function SearchablePicker({
  label,
  placeholder,
  value,
  options,
  onChange
}: {
  label: string;
  placeholder: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  const menuId = useId();
  const selected = options.find((option) => option.id === value);
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return options
      .filter((option) => !normalized || option.label.toLocaleLowerCase().includes(normalized))
      .slice(0, 50);
  }, [options, query]);

  const choose = (option: Option) => {
    onChange(option.id);
    setQuery(option.label);
    setOpen(false);
  };

  return (
    <div className="searchable-picker">
      <input
        aria-autocomplete="list"
        aria-controls={menuId}
        aria-expanded={open}
        aria-label={label}
        aria-required="true"
        placeholder={placeholder}
        role="combobox"
        value={query}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange("");
          setOpen(true);
        }}
        onFocus={(event) => {
          event.currentTarget.select();
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter" && open && matches[0]) {
            event.preventDefault();
            choose(matches[0]);
          }
        }}
      />
      {open ? (
        <div className="searchable-picker-menu" id={menuId} role="listbox">
          {matches.length ? matches.map((option) => (
            <button key={option.id} type="button" role="option" aria-selected={option.id === value} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>
              {option.label}
            </button>
          )) : <span>No matches</span>}
          {matches.length === 50 ? <small>Keep typing to narrow the results.</small> : null}
        </div>
      ) : null}
    </div>
  );
}

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
              <SearchablePicker label="Role" placeholder="Search roles…" value={row.roleId} options={roles.filter((option) => !regularRows.some((item) => item.key !== row.key && item.roleId === option.id))} onChange={(roleId) => setRegularRows((rows) => rows.map((item) => item.key === row.key ? { ...item, roleId } : item))} />
              <SearchablePicker label="Person" placeholder="Search people…" value={row.personId} options={people} onChange={(personId) => setRegularRows((rows) => rows.map((item) => item.key === row.key ? { ...item, personId } : item))} />
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
              <SearchablePicker label="Theatre Budget guest artist" placeholder="Search guest artists…" value={row.guestArtistId} options={guestArtists} onChange={(guestArtistId) => setBudgetRows((rows) => rows.map((item) => item.key === row.key ? { ...item, guestArtistId } : item))} />
              <SearchablePicker label="Project role" placeholder="Search roles…" value={row.roleId} options={roles.filter((option) => !budgetRows.some((item) => item.key !== row.key && item.roleId === option.id))} onChange={(roleId) => setBudgetRows((rows) => rows.map((item) => item.key === row.key ? { ...item, roleId } : item))} />
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
