import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { fetchReferenceDataOverview } from "@/lib/reference-data";
import {
  archiveReferenceRecordAction,
  createDepartmentAction,
  createLocationAction,
  createReferenceValueAction
} from "@/app/settings/reference-data/actions";

export const dynamic = "force-dynamic";

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function StatusPill({ active }: { active: boolean }) {
  return <span className={active ? "status-pill active" : "status-pill inactive"}>{active ? "Active" : "Archived"}</span>;
}

export default async function ReferenceDataPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const { departments, locations, referenceValues } = await fetchReferenceDataOverview();
  const groupedReferences = referenceValues.reduce<Record<string, typeof referenceValues>>((groups, value) => {
    groups[value.reference_type] = groups[value.reference_type] ?? [];
    groups[value.reference_type].push(value);
    return groups;
  }, {});

  return (
    <div className="page workspace-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Reference Data</h1>
          <p className="muted">
            Manage reusable institutional options used by projects, calendar items, roles, and future modules.
          </p>
        </div>
        <div className="top-actions"><Link className="button secondary" href="/settings/email-templates">Email Templates</Link><Link className="button secondary" href="/projects">Projects</Link></div>
      </div>

      {params?.error ? <p className="setup-warning">{params.error}</p> : null}

      <div className="settings-grid">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Institution</p>
              <h2>Departments</h2>
            </div>
          </div>
          <form action={createDepartmentAction} className="inline-create reference-create">
            <input aria-label="Department name" name="name" placeholder="New department" required />
            <button type="submit">Add</button>
          </form>
          <div className="compact-list">
            {departments.map((department) => (
              <div className="compact-row" key={department.id}>
                <div>
                  <strong>{department.name}</strong>
                  <span>{department.slug}</span>
                </div>
                <StatusPill active={department.is_active} />
                {department.is_active ? (
                  <form action={archiveReferenceRecordAction}>
                    <input name="kind" type="hidden" value="department" />
                    <input name="id" type="hidden" value={department.id} />
                    <button className="button danger" type="submit">
                      Archive
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Places</p>
              <h2>Locations</h2>
            </div>
          </div>
          <form action={createLocationAction} className="inline-create reference-create">
            <input aria-label="Location name" name="name" placeholder="New location" required />
            <button type="submit">Add</button>
          </form>
          <div className="compact-list">
            {locations.map((location) => (
              <div className="compact-row" key={location.id}>
                <div>
                  <strong>{location.name}</strong>
                  <span>
                    {location.slug}
                    {location.building ? ` · ${location.building}` : ""}
                  </span>
                </div>
                <StatusPill active={location.is_active} />
                {location.is_active ? (
                  <form action={archiveReferenceRecordAction}>
                    <input name="kind" type="hidden" value="location" />
                    <input name="id" type="hidden" value={location.id} />
                    <button className="button danger" type="submit">
                      Archive
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel workspace-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Controlled Vocabulary</p>
            <h2>Reference Values</h2>
          </div>
        </div>
        <form action={createReferenceValueAction} className="inline-create reference-value-create">
          <select aria-label="Reference type" name="referenceType" defaultValue="project_type">
            <option value="project_type">Project type</option>
            <option value="calendar_item_type">Calendar item type</option>
            <option value="role_group">Role group</option>
          </select>
          <input aria-label="Reference value label" name="label" placeholder="New value" required />
          <button type="submit">Add</button>
        </form>
        <div className="reference-groups">
          {Object.entries(groupedReferences).map(([referenceType, values]) => (
            <section className="reference-group" key={referenceType}>
              <h3>{titleCase(referenceType)}</h3>
              <div className="compact-list">
                {values.map((value) => (
                  <div className="compact-row" key={value.id}>
                    <div>
                      <strong>{value.label}</strong>
                      <span>{value.slug}</span>
                    </div>
                    <StatusPill active={value.is_active} />
                    {value.is_active ? (
                      <form action={archiveReferenceRecordAction}>
                        <input name="kind" type="hidden" value="reference_value" />
                        <input name="id" type="hidden" value={value.id} />
                        <button className="button danger" type="submit">
                          Archive
                        </button>
                      </form>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
