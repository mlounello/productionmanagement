import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  createCalendarItemAction,
  createProjectRoleAction,
  createRunOfShowItemAction,
  deleteCalendarItemAction,
  deleteRunOfShowItemAction
} from "@/app/projects/[projectId]/actions";
import {
  DepartmentSelector,
  LocationSelector,
  ReferenceValueSelector
} from "@/components/reference-selectors";
import { fetchActiveDepartments, fetchActiveLocations, fetchActiveReferenceValues } from "@/lib/reference-data";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

type Project = {
  id: string;
  title: string;
  project_type: string;
  status: string;
  starts_on: string | null;
  ends_on: string | null;
};

type CalendarItem = {
  id: string;
  title: string;
  item_type: string;
  starts_at: string | null;
  ends_at: string | null;
  due_at: string | null;
  status: string;
  department: string;
  department_id: string | null;
  location: string;
  location_id: string | null;
};

type ProjectRole = {
  id: string;
  name: string;
  role_group: string;
  department: string;
};

type RunOfShowItem = {
  id: string;
  cue_number: string;
  title: string;
  starts_at: string | null;
  duration_minutes: number | null;
};

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseDate(value: string | null) {
  if (!value) {
    return null;
  }

  return new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

function daysBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS));
}

function formatDate(value: string | null) {
  const date = parseDate(value);
  if (!date) {
    return "Unscheduled";
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function formatDateTime(value: string | null) {
  const date = parseDate(value);
  if (!date) {
    return "TBD";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatItemDates(item: CalendarItem) {
  const start = formatDate(item.starts_at);
  const end = formatDate(item.ends_at);
  const due = formatDate(item.due_at);

  if (item.starts_at && item.ends_at) {
    return `${start} to ${end}`;
  }

  if (item.starts_at) {
    return `Starts ${start}`;
  }

  if (item.due_at) {
    return `Due ${due}`;
  }

  return "Unscheduled";
}

function itemRange(item: CalendarItem) {
  const start = parseDate(item.starts_at) ?? parseDate(item.due_at) ?? parseDate(item.ends_at);
  const end = parseDate(item.ends_at) ?? parseDate(item.due_at) ?? parseDate(item.starts_at);

  if (!start || !end) {
    return null;
  }

  return { start, end: end < start ? start : end };
}

function getTimeline(project: Project, items: CalendarItem[]) {
  const ranges = items.map(itemRange).filter((range): range is { start: Date; end: Date } => Boolean(range));
  const projectStart = parseDate(project.starts_on);
  const projectEnd = parseDate(project.ends_on);
  const starts = [projectStart, ...ranges.map((range) => range.start)].filter((date): date is Date => Boolean(date));
  const ends = [projectEnd, ...ranges.map((range) => range.end)].filter((date): date is Date => Boolean(date));
  const start = starts.length
    ? new Date(Math.min(...starts.map((date) => date.getTime())))
    : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const end = ends.length ? new Date(Math.max(...ends.map((date) => date.getTime()))) : addDays(start, 84);
  const totalWeeks = Math.max(4, Math.min(32, Math.ceil((daysBetween(start, end) + 1) / 7)));

  return {
    start,
    end: addDays(start, totalWeeks * 7),
    weeks: Array.from({ length: totalWeeks }, (_, index) => addDays(start, index * 7))
  };
}

function ganttStyle(range: { start: Date; end: Date }, timelineStart: Date): CSSProperties {
  const startWeek = Math.floor(daysBetween(timelineStart, range.start) / 7);
  const spanWeeks = Math.max(1, Math.ceil((daysBetween(range.start, range.end) + 1) / 7));

  return {
    gridColumn: `${startWeek + 1} / span ${spanWeeks}`
  };
}

export default async function ProjectPage({
  params,
  searchParams
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, title, project_type, status, starts_on, ends_on")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) {
    notFound();
  }

  const typedProject = project as Project;
  const [
    { data: calendarItems },
    { data: projectRoles },
    { data: runOfShowItems },
    departments,
    locations,
    calendarItemTypes,
    roleGroups
  ] = await Promise.all([
    supabase
      .from("calendar_items")
      .select("id, title, item_type, starts_at, ends_at, due_at, status, department, department_id, location, location_id")
      .eq("project_id", typedProject.id)
      .order("starts_at", { ascending: true }),
    supabase
      .from("project_roles")
      .select("id, name, role_group, department")
      .eq("project_id", typedProject.id)
      .order("role_group", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("run_of_show_items")
      .select("id, cue_number, title, starts_at, duration_minutes")
      .eq("project_id", typedProject.id)
      .order("starts_at", { ascending: true })
      .order("sort_order", { ascending: true }),
    fetchActiveDepartments(),
    fetchActiveLocations(),
    fetchActiveReferenceValues("calendar_item_type"),
    fetchActiveReferenceValues("role_group")
  ]);

  const items = (calendarItems ?? []) as CalendarItem[];
  const roles = (projectRoles ?? []) as ProjectRole[];
  const runRows = (runOfShowItems ?? []) as RunOfShowItem[];
  const timeline = getTimeline(typedProject, items);

  return (
    <div className="page workspace-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{titleCase(typedProject.project_type)}</p>
          <h1>{typedProject.title}</h1>
          <p className="muted">
            {titleCase(typedProject.status)} · {formatDate(typedProject.starts_on)} to {formatDate(typedProject.ends_on)}
          </p>
        </div>
        <Link className="button secondary" href="/projects">
          Projects
        </Link>
      </div>

      {query?.error ? <p className="setup-warning">{query.error}</p> : null}

      <nav className="workspace-nav" aria-label="Project workspace sections">
        <a href="#calendar">Calendar</a>
        <a href="#gantt">Gantt</a>
        <a href="#roles">Roles</a>
        <a href="#run-of-show">Run of Show</a>
      </nav>

      <section className="workspace-summary" aria-label="Project summary">
        <div>
          <span>{items.length}</span>
          <p>Calendar Items</p>
        </div>
        <div>
          <span>{roles.length}</span>
          <p>Roles</p>
        </div>
        <div>
          <span>{runRows.length}</span>
          <p>Run Rows</p>
        </div>
        <div>
          <span>{timeline.weeks.length}</span>
          <p>Timeline Weeks</p>
        </div>
      </section>

      <div className="workspace-grid">
        <section className="panel workspace-main" id="gantt">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Production Calendar</p>
              <h2>Gantt</h2>
            </div>
          </div>
          <div className="gantt" style={{ "--gantt-columns": timeline.weeks.length } as CSSProperties}>
            <div className="gantt-label">Workstream</div>
            <div className="gantt-weeks">
              {timeline.weeks.map((week) => (
                <span key={week.toISOString()}>{formatDate(week.toISOString())}</span>
              ))}
            </div>
            {items.length ? (
              items.map((item) => {
                const range = itemRange(item);

                return (
                  <div className="gantt-row" key={item.id}>
                    <div className="gantt-title">
                      <strong>{item.title}</strong>
                      <span>
                        {titleCase(item.item_type)}
                        {item.department ? ` · ${item.department}` : ""}
                      </span>
                    </div>
                    <div className="gantt-track">
                      {range ? (
                        <div
                          className={`gantt-bar gantt-${item.item_type}`}
                          style={ganttStyle(range, timeline.start)}
                          title={`${item.title}: ${formatDate(range.start.toISOString())} to ${formatDate(range.end.toISOString())}`}
                        >
                          <span>{item.title}</span>
                        </div>
                      ) : (
                        <span className="gantt-unscheduled">Unscheduled</span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-state">Add calendar items to build the first production timeline.</div>
            )}
          </div>
        </section>

        <section className="panel" id="calendar">
          <p className="eyebrow">Create</p>
          <h2>Calendar Item</h2>
          <form action={createCalendarItemAction} className="form-grid">
            <input name="projectId" type="hidden" value={typedProject.id} />
            <div className="field">
              <label htmlFor="title">Title</label>
              <input id="title" name="title" required />
            </div>
            <ReferenceValueSelector
              label="Type"
              name="itemType"
              options={calendarItemTypes}
              placeholder="Select item type"
              required
              selectId="itemType"
            />
            <div className="form-row">
              <div className="field">
                <label htmlFor="startsOn">Start</label>
                <input id="startsOn" name="startsOn" type="date" />
              </div>
              <div className="field">
                <label htmlFor="endsOn">End</label>
                <input id="endsOn" name="endsOn" type="date" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="dueOn">Due</label>
              <input id="dueOn" name="dueOn" type="date" />
            </div>
            <DepartmentSelector departments={departments} name="departmentId" selectId="calendarDepartmentId" />
            <LocationSelector locations={locations} name="locationId" selectId="calendarLocationId" />
            <button type="submit">Add item</button>
          </form>
        </section>
      </div>

      <section className="panel workspace-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Production Calendar</p>
            <h2>Calendar Items</h2>
          </div>
        </div>
        <div className="table-list">
          {items.length ? (
            items.map((item) => (
              <div className="table-row" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <span>
                    {titleCase(item.item_type)} · {titleCase(item.status)}
                    {item.department ? ` · ${item.department}` : ""}
                    {item.location ? ` · ${item.location}` : ""}
                  </span>
                </div>
                <span>{formatItemDates(item)}</span>
                <form action={deleteCalendarItemAction}>
                  <input name="projectId" type="hidden" value={typedProject.id} />
                  <input name="id" type="hidden" value={item.id} />
                  <button className="button danger" type="submit">
                    Delete
                  </button>
                </form>
              </div>
            ))
          ) : (
            <p className="muted">No calendar items yet.</p>
          )}
        </div>
      </section>

      <div className="grid two workspace-lower">
        <section className="panel" id="roles">
          <div className="section-heading">
            <div>
              <p className="eyebrow">People Structure</p>
              <h2>Roles</h2>
            </div>
          </div>
          <form action={createProjectRoleAction} className="inline-create">
            <input name="projectId" type="hidden" value={typedProject.id} />
            <input aria-label="Role name" name="name" placeholder="Role name" required />
            <select aria-label="Role group" name="roleGroup" defaultValue="production_team">
              {roleGroups.map((roleGroup) => (
                <option key={roleGroup.id} value={roleGroup.slug}>
                  {roleGroup.label}
                </option>
              ))}
            </select>
            <select aria-label="Department" name="departmentId" defaultValue="">
              <option value="">Department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            <button type="submit">Add role</button>
          </form>
          <div className="compact-list">
            {roles.length ? (
              roles.map((role) => (
                <div className="compact-row" key={role.id}>
                  <strong>{role.name}</strong>
                  <span>
                    {titleCase(role.role_group)}
                    {role.department ? ` · ${role.department}` : ""}
                  </span>
                </div>
              ))
            ) : (
              <p className="muted">No roles yet.</p>
            )}
          </div>
        </section>

        <section className="panel" id="run-of-show">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Event Flow</p>
              <h2>Run of Show</h2>
            </div>
          </div>
          <form action={createRunOfShowItemAction} className="inline-create run-create">
            <input name="projectId" type="hidden" value={typedProject.id} />
            <input aria-label="Cue number" name="cueNumber" placeholder="Cue" />
            <input aria-label="Run row title" name="title" placeholder="Run row title" required />
            <input aria-label="Start time" name="startsAt" type="datetime-local" />
            <input aria-label="Duration" min="0" name="durationMinutes" placeholder="Min" type="number" />
            <button type="submit">Add row</button>
          </form>
          <div className="compact-list">
            {runRows.length ? (
              runRows.map((row) => (
                <div className="compact-row" key={row.id}>
                  <div>
                    <strong>
                      {row.cue_number ? `${row.cue_number} · ` : ""}
                      {row.title}
                    </strong>
                    <span>
                      {formatDateTime(row.starts_at)}
                      {row.duration_minutes ? ` · ${row.duration_minutes} min` : ""}
                    </span>
                  </div>
                  <form action={deleteRunOfShowItemAction}>
                    <input name="projectId" type="hidden" value={typedProject.id} />
                    <input name="id" type="hidden" value={row.id} />
                    <button className="button danger" type="submit">
                      Delete
                    </button>
                  </form>
                </div>
              ))
            ) : (
              <p className="muted">No run-of-show rows yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
