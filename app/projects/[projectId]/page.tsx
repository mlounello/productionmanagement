import { Fragment, type CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  addProjectLocationAction,
  archiveTimelineGroupAction,
  createCalendarItemAction,
  createProjectRoleAction,
  createRunOfShowItemAction,
  createTimelineGroupAction,
  deleteCalendarItemAction,
  deleteProjectAction,
  deleteRunOfShowItemAction,
  removeProjectLocationAction
} from "@/app/projects/[projectId]/actions";
import {
  DepartmentSelector,
  LocationSelector,
  ReferenceValueSelector
} from "@/components/reference-selectors";
import { TimelineGroupSelector } from "@/components/timeline-group-selector";
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
  timeline_group_id: string | null;
};

type TimelineGroup = {
  id: string;
  name: string;
  slug: string;
  description: string;
  color_key: string;
  sort_order: number;
  is_active: boolean;
};

type GanttSection = {
  group: TimelineGroup | null;
  items: CalendarItem[];
  range: { start: Date; end: Date } | null;
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

type ProjectLocation = {
  id: string;
  location_id: string;
  locations: {
    id: string;
    name: string;
    building: string;
    room: string;
    is_active: boolean;
  } | null;
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

function sectionRange(items: CalendarItem[]) {
  const ranges = items.map(itemRange).filter((range): range is { start: Date; end: Date } => Boolean(range));

  if (!ranges.length) {
    return null;
  }

  return {
    start: new Date(Math.min(...ranges.map((range) => range.start.getTime()))),
    end: new Date(Math.max(...ranges.map((range) => range.end.getTime())))
  };
}

function buildGanttSections(items: CalendarItem[], groups: TimelineGroup[]) {
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const sections: GanttSection[] = groups
    .map((group) => {
      const childItems = items.filter((item) => item.timeline_group_id === group.id);
      return {
        group,
        items: childItems,
        range: sectionRange(childItems)
      };
    })
    .filter((section) => section.items.length || section.group.is_active);

  const ungroupedItems = items.filter((item) => !item.timeline_group_id || !groupsById.has(item.timeline_group_id));
  if (ungroupedItems.length) {
    sections.push({
      group: null,
      items: ungroupedItems,
      range: sectionRange(ungroupedItems)
    });
  }

  return sections;
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
    { data: projectLocations },
    { data: timelineGroups },
    departments,
    locations,
    calendarItemTypes,
    roleGroups
  ] = await Promise.all([
    supabase
      .from("calendar_items")
      .select(
        "id, title, item_type, starts_at, ends_at, due_at, status, department, department_id, location, location_id, timeline_group_id"
      )
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
    supabase
      .from("project_locations")
      .select("id, location_id, locations(id, name, building, room, is_active)")
      .eq("project_id", typedProject.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("project_timeline_groups")
      .select("id, name, slug, description, color_key, sort_order, is_active")
      .eq("project_id", typedProject.id)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    fetchActiveDepartments(),
    fetchActiveLocations(),
    fetchActiveReferenceValues("calendar_item_type"),
    fetchActiveReferenceValues("role_group")
  ]);

  const items = (calendarItems ?? []) as CalendarItem[];
  const roles = (projectRoles ?? []) as ProjectRole[];
  const runRows = (runOfShowItems ?? []) as RunOfShowItem[];
  const projectLocationRows = (projectLocations ?? []) as unknown as ProjectLocation[];
  const groups = (timelineGroups ?? []) as TimelineGroup[];
  const activeGroups = groups.filter((group) => group.is_active);
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const linkedLocationIds = new Set(projectLocationRows.map((projectLocation) => projectLocation.location_id));
  const availableProjectLocations = locations.filter((location) => !linkedLocationIds.has(location.id));
  const timeline = getTimeline(typedProject, items);
  const ganttSections = buildGanttSections(items, groups);

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
        <div className="top-actions">
          <Link className="button secondary" href="/projects">
            Projects
          </Link>
          <form action={deleteProjectAction}>
            <input name="projectId" type="hidden" value={typedProject.id} />
            <button className="button danger" type="submit">
              Delete Project
            </button>
          </form>
        </div>
      </div>

      {query?.error ? <p className="setup-warning">{query.error}</p> : null}

      <nav className="workspace-nav" aria-label="Project workspace sections">
        <a href="#calendar">Calendar</a>
        <a href="#gantt">Gantt</a>
        <a href="#timeline-groups">Timeline Groups</a>
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

      <section className="panel workspace-section" id="timeline-groups">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Planning Core</p>
            <h2>Timeline Groups</h2>
            <p className="muted">
              Group calendar items into project-specific Gantt phases without changing each item&apos;s type.
            </p>
          </div>
        </div>
        <form action={createTimelineGroupAction} className="inline-create reference-create">
          <input name="projectId" type="hidden" value={typedProject.id} />
          <input aria-label="Timeline group name" name="name" placeholder="Rehearsals" required />
          <button type="submit">Add group</button>
        </form>
        <div className="compact-list">
          {groups.length ? (
            groups.map((group) => {
              const attachedCount = items.filter((item) => item.timeline_group_id === group.id).length;

              return (
                <div className="compact-row" key={group.id}>
                  <div>
                    <strong>{group.name}</strong>
                    <span>
                      {attachedCount} item{attachedCount === 1 ? "" : "s"}
                      {!group.is_active ? " · Archived" : ""}
                    </span>
                  </div>
                  {group.is_active ? (
                    <form action={archiveTimelineGroupAction}>
                      <input name="projectId" type="hidden" value={typedProject.id} />
                      <input name="id" type="hidden" value={group.id} />
                      <button className="button secondary" type="submit">
                        Archive
                      </button>
                    </form>
                  ) : null}
                </div>
              );
            })
          ) : (
            <p className="muted">No timeline groups yet.</p>
          )}
        </div>
      </section>

      <section className="panel workspace-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Project Scope</p>
            <h2>Project Locations</h2>
            <p className="muted">
              Add the locations this project is likely to use. Calendar items can still choose their exact location.
            </p>
          </div>
        </div>
        <form action={addProjectLocationAction} className="inline-create reference-create">
          <input name="projectId" type="hidden" value={typedProject.id} />
          <select aria-label="Add project location" name="locationId" defaultValue="" required>
            <option value="">Add location</option>
            {availableProjectLocations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
          <button type="submit">Add</button>
        </form>
        <div className="compact-list">
          {projectLocationRows.length ? (
            projectLocationRows.map((projectLocation) => (
              <div className="compact-row" key={projectLocation.id}>
                <div>
                  <strong>{projectLocation.locations?.name ?? "Unknown location"}</strong>
                  <span>
                    {projectLocation.locations?.building ?? ""}
                    {projectLocation.locations?.room ? ` · ${projectLocation.locations.room}` : ""}
                    {projectLocation.locations && !projectLocation.locations.is_active ? " · Archived" : ""}
                  </span>
                </div>
                <form action={removeProjectLocationAction}>
                  <input name="projectId" type="hidden" value={typedProject.id} />
                  <input name="id" type="hidden" value={projectLocation.id} />
                  <button className="button danger" type="submit">
                    Remove
                  </button>
                </form>
              </div>
            ))
          ) : (
            <p className="muted">No project-level locations yet.</p>
          )}
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
            {ganttSections.length ? (
              ganttSections.map((section) => (
                <Fragment key={section.group?.id ?? "ungrouped"}>
                  <div className="gantt-row gantt-group-row">
                    <div className="gantt-title">
                      <strong>{section.group?.name ?? "Ungrouped"}</strong>
                      <span>
                        {section.items.length} item{section.items.length === 1 ? "" : "s"}
                        {section.group && !section.group.is_active ? " · Archived" : ""}
                      </span>
                    </div>
                    <div className="gantt-track">
                      {section.range ? (
                        <div
                          className={`gantt-bar gantt-group-bar gantt-group-${section.group?.color_key ?? "gray"}`}
                          style={ganttStyle(section.range, timeline.start)}
                          title={`${section.group?.name ?? "Ungrouped"}: ${formatDate(
                            section.range.start.toISOString()
                          )} to ${formatDate(section.range.end.toISOString())}`}
                        >
                          <span>{section.group?.name ?? "Ungrouped"}</span>
                        </div>
                      ) : (
                        <span className="gantt-unscheduled">No scheduled items</span>
                      )}
                    </div>
                  </div>
                  {section.items.map((item) => {
                    const range = itemRange(item);

                    return (
                      <div className="gantt-row" key={item.id}>
                        <div className="gantt-title gantt-child-title">
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
                              title={`${item.title}: ${formatDate(range.start.toISOString())} to ${formatDate(
                                range.end.toISOString()
                              )}`}
                            >
                              <span>{item.title}</span>
                            </div>
                          ) : (
                            <span className="gantt-unscheduled">Unscheduled</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </Fragment>
              ))
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
            <TimelineGroupSelector groups={activeGroups} />
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
            items.map((item) => {
              const itemGroup = item.timeline_group_id ? groupsById.get(item.timeline_group_id) : null;

              return (
                <div className="table-row" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {titleCase(item.item_type)} · {titleCase(item.status)}
                      {itemGroup ? ` · ${itemGroup.name}${!itemGroup.is_active ? " (Archived)" : ""}` : ""}
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
              );
            })
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
