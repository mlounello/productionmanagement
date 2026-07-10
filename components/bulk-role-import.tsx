"use client";

import { useMemo, useState } from "react";

type RoleGroupOption = { slug: string; label: string };
type ExistingRole = { name: string; role_group: string };

export function BulkRoleImport({
  projectId,
  roleGroups,
  existingRoles,
  action
}: {
  projectId: string;
  roleGroups: RoleGroupOption[];
  existingRoles: ExistingRole[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const defaultGroup = roleGroups.some((group) => group.slug === "production_team") ? "production_team" : roleGroups[0]?.slug ?? "production_team";
  const [raw, setRaw] = useState("");
  const parsed = useMemo(() => {
    const existing = new Set(existingRoles.map((role) => `${role.name.trim().toLowerCase()}|${role.role_group}`));
    return raw
      .split(/\r?\n/)
      .map((line, index) => {
        const [namePart = "", groupPart = "", departmentPart = ""] = line.split("|");
        const name = namePart.trim();
        const requestedGroup = groupPart.trim().toLowerCase().replace(/\s+/g, "_");
        const roleGroup = roleGroups.some((group) => group.slug === requestedGroup) ? requestedGroup : defaultGroup;
        return {
          line: index + 1,
          name,
          roleGroup,
          department: departmentPart.trim(),
          duplicate: existing.has(`${name.toLowerCase()}|${roleGroup}`)
        };
      })
      .filter((role) => role.name);
  }, [raw, existingRoles, roleGroups, defaultGroup]);
  const creatable = parsed.filter((role) => !role.duplicate);

  return (
    <details className="integration-panel">
      <summary>
        <strong>Bulk load roles</strong>
        <span>Paste one role per line and preview before creating.</span>
      </summary>
      <form action={action} className="stacked-form">
        <input name="projectId" type="hidden" value={projectId} />
        <input name="rolesJson" type="hidden" value={JSON.stringify(creatable)} />
        <label className="field">
          <span>Roles</span>
          <textarea
            rows={8}
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            placeholder={"Sarah Brown | cast | Cast\nMusic Director | creative_team | Music\nStage Manager | production_team | Production"}
          />
          <small>Format: Role name | role group | department. Group and department are optional.</small>
        </label>
        {parsed.length ? (
          <div className="compact-list">
            {parsed.map((role) => (
              <div className="table-row" key={`${role.line}-${role.name}`}>
                <div>
                  <strong>{role.name}</strong>
                  <span>{role.roleGroup.replace(/_/g, " ")}{role.department ? ` · ${role.department}` : ""}</span>
                </div>
                <span className={`status-badge${role.duplicate ? " gold" : ""}`}>{role.duplicate ? "Already exists" : "Ready"}</span>
              </div>
            ))}
          </div>
        ) : null}
        <button type="submit" disabled={creatable.length === 0}>Create and sync {creatable.length || ""} roles</button>
      </form>
    </details>
  );
}
