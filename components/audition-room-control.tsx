"use client";

import { useMemo, useState } from "react";

type Applicant = {
  id: string;
  name: string;
  email: string;
  auditionStatus: string;
  recommendation: string;
  readRoleIds: string[];
  slotLabel: string;
};

type Role = { id: string; name: string };

const recommendations = [
  ["", "No decision"],
  ["callback", "Callback"],
  ["consider", "Consider"],
  ["cast", "Cast"],
  ["not_cast", "Do not cast"],
  ["discuss", "Needs discussion"]
] as const;

export function AuditionRoomControl({ projectId, applicants: initial, roles }: { projectId: string; applicants: Applicant[]; roles: Role[] }) {
  const [applicants, setApplicants] = useState(initial);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const visible = useMemo(() => applicants.filter((applicant) => {
    const matchesQuery = `${applicant.name} ${applicant.email} ${applicant.slotLabel}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "all"
      || (filter === "arrived" && ["checked_in", "auditioned"].includes(applicant.auditionStatus))
      || (filter === "waiting" && applicant.auditionStatus === "registered")
      || applicant.recommendation === filter;
    return matchesQuery && matchesFilter;
  }), [applicants, filter, query]);

  async function patch(submissionId: string, body: Record<string, unknown>) {
    const key = `${submissionId}:${Object.keys(body)[0]}`;
    setSaving((current) => ({ ...current, [key]: true }));
    setErrors((current) => ({ ...current, [submissionId]: "" }));
    const response = await fetch(`/api/projects/${projectId}/audition-room/${submissionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    setSaving((current) => ({ ...current, [key]: false }));
    if (!response.ok) {
      setErrors((current) => ({ ...current, [submissionId]: payload.error || "The update could not be saved." }));
      throw new Error(payload.error || "Save failed");
    }
  }

  async function setAttendance(submissionId: string, checked: boolean) {
    const before = applicants;
    setApplicants((rows) => rows.map((row) => row.id === submissionId ? { ...row, auditionStatus: checked ? "checked_in" : "registered" } : row));
    try { await patch(submissionId, { auditionStatus: checked ? "checked_in" : "registered" }); }
    catch { setApplicants(before); }
  }

  async function setRecommendation(submissionId: string, recommendation: string) {
    const before = applicants;
    setApplicants((rows) => rows.map((row) => row.id === submissionId ? { ...row, recommendation } : row));
    try { await patch(submissionId, { recommendation }); }
    catch { setApplicants(before); }
  }

  async function setRead(submissionId: string, roleId: string, checked: boolean) {
    const before = applicants;
    setApplicants((rows) => rows.map((row) => row.id === submissionId
      ? { ...row, readRoleIds: checked ? [...new Set([...row.readRoleIds, roleId])] : row.readRoleIds.filter((id) => id !== roleId) }
      : row));
    try { await patch(submissionId, { roleId, read: checked }); }
    catch { setApplicants(before); }
  }

  return <div className="audition-room">
    <div className="audition-room-toolbar">
      <label className="field"><span>Find applicant</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, or audition time"/></label>
      <label className="field"><span>Show</span><select value={filter} onChange={(event) => setFilter(event.target.value)}>
        <option value="all">Everyone</option><option value="waiting">Not checked in</option><option value="arrived">Checked in / auditioned</option>
        {recommendations.slice(1).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select></label>
      <p className="muted audition-room-save-note">Changes save automatically. Applicant emails are always sent separately.</p>
    </div>
    <div className="audition-room-table-wrap">
      <table className="audition-room-table">
        <thead><tr><th className="audition-room-name">Applicant</th><th>Checked in</th>{roles.map((role) => <th key={role.id}>{role.name}</th>)}<th className="audition-room-decision">Next step</th></tr></thead>
        <tbody>{visible.map((applicant) => <tr key={applicant.id}>
          <th scope="row"><strong>{applicant.name}</strong><span>{applicant.slotLabel || applicant.email}</span>{errors[applicant.id] ? <small className="field-error">{errors[applicant.id]}</small> : null}</th>
          <td><label className="room-check"><input type="checkbox" checked={["checked_in", "auditioned"].includes(applicant.auditionStatus)} disabled={saving[`${applicant.id}:auditionStatus`]} onChange={(event) => void setAttendance(applicant.id, event.target.checked)}/><span aria-hidden="true">✓</span></label></td>
          {roles.map((role) => <td key={role.id}><label className="room-check"><input type="checkbox" checked={applicant.readRoleIds.includes(role.id)} disabled={saving[`${applicant.id}:roleId`]} onChange={(event) => void setRead(applicant.id, role.id, event.target.checked)}/><span aria-hidden="true">✓</span></label></td>)}
          <td><select className={`room-decision room-decision-${applicant.recommendation || "none"}`} value={applicant.recommendation} disabled={saving[`${applicant.id}:recommendation`]} onChange={(event) => void setRecommendation(applicant.id, event.target.value)}>{recommendations.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></td>
        </tr>)}</tbody>
      </table>
    </div>
    {!visible.length ? <p className="empty-state">No applicants match this view.</p> : null}
  </div>;
}
