import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  addProjectLocationAction,
  addPersonNoteAction,
  archiveTimelineGroupAction,
  createPersonAction,
  createProjectRoleAction,
  createRoleAssignmentAction,
  createTimelineGroupAction,
  deleteCalendarItemAction,
  deleteProjectAction,
  deleteRoleAssignmentAction,
  deleteRunOfShowItemAction,
  linkTheatreBudgetGuestArtistAction,
  removeProjectLocationAction,
  unlinkTheatreBudgetGuestArtistAction,
  updateProjectRoleAction,
  updateRoleAssignmentAction
} from "@/app/projects/[projectId]/actions";
import { ProjectCalendar } from "@/components/project-calendar";
import { ProjectGantt, type ProjectGanttSection } from "@/components/project-gantt";
import { fetchActiveDepartments, fetchActiveLocations, fetchActiveReferenceValues } from "@/lib/reference-data";
import { fetchTheatreBudgetGuestArtists, type TheatreBudgetGuestArtist } from "@/lib/theatre-budget";

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
  all_day: boolean;
  status: string;
  description: string;
  department: string;
  department_id: string | null;
  location: string;
  location_id: string | null;
  timeline_group_id: string | null;
  is_run_of_show_relevant: boolean;
  run_of_show_order: number | null;
  cue_number: string;
  duration_minutes: number | null;
  run_of_show_notes: string;
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

type Person = {
  id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  preferred_name: string;
  email: string;
  vendor_number: string;
  phone: string;
  pronouns: string;
  affiliation: string;
  person_type: string;
  status: string;
};

type RoleAssignment = {
  id: string;
  role_id: string;
  person_id: string;
  status: string;
  confirmation_status: string;
  notes: string;
  is_guest_artist: boolean;
  playbill_sync_status: string;
  guest_artist_sync_status: string;
};

type PersonNote = {
  id: string;
  person_id: string;
  project_id: string | null;
  visibility: string;
  note: string;
  is_pinned: boolean;
  created_at: string;
};

type ExternalLink = {
  id: string;
  local_entity_id: string;
  external_id: string;
  sync_status: string;
  metadata: Record<string, unknown>;
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

function sortableEventTime(item: CalendarItem) {
  return parseDate(item.starts_at) ?? parseDate(item.due_at) ?? parseDate(item.ends_at);
}

function compareRunOfShowItems(left: CalendarItem, right: CalendarItem) {
  const leftTime = sortableEventTime(left);
  const rightTime = sortableEventTime(right);
  const leftTimestamp = leftTime?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightTimestamp = rightTime?.getTime() ?? Number.MAX_SAFE_INTEGER;

  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }

  const leftOrder = left.run_of_show_order ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.run_of_show_order ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  const cueCompare = left.cue_number.localeCompare(right.cue_number, undefined, { numeric: true });
  if (cueCompare !== 0) {
    return cueCompare;
  }

  return left.title.localeCompare(right.title);
}

function normalizeMatchValue(value: string) {
  return value.trim().toLowerCase();
}

function suggestedGuestArtistMatches(person: Person | undefined, guestArtists: TheatreBudgetGuestArtist[]) {
  if (!person) {
    return [];
  }

  const personEmail = normalizeMatchValue(person.email);
  const personName = normalizeMatchValue(person.full_name);

  return guestArtists
    .filter((artist) => {
      const artistEmail = normalizeMatchValue(artist.email ?? "");
      const artistName = normalizeMatchValue(artist.display_name);
      return (personEmail && artistEmail === personEmail) || (personName && artistName === personName);
    })
    .slice(0, 3);
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

export default async function ProjectPage({
  params,
  searchParams
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<{ error?: string; success?: string }>;
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
    { data: people },
    { data: roleAssignments },
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
        "id, title, item_type, starts_at, ends_at, due_at, all_day, status, description, department, department_id, location, location_id, timeline_group_id, is_run_of_show_relevant, run_of_show_order, cue_number, duration_minutes, run_of_show_notes"
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
      .from("people")
      .select("id, full_name, first_name, last_name, preferred_name, email, vendor_number, phone, pronouns, affiliation, person_type, status")
      .order("full_name", { ascending: true }),
    supabase
      .from("role_assignments")
      .select(
        "id, role_id, person_id, status, confirmation_status, notes, is_guest_artist, playbill_sync_status, guest_artist_sync_status"
      )
      .eq("project_id", typedProject.id)
      .order("created_at", { ascending: true }),
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
  const peopleRows = (people ?? []) as Person[];
  const assignmentRows = (roleAssignments ?? []) as RoleAssignment[];
  const projectPersonIds = Array.from(new Set(assignmentRows.map((assignment) => assignment.person_id)));
  const { data: personNotes } = projectPersonIds.length
    ? await supabase
        .from("person_notes")
        .select("id, person_id, project_id, visibility, note, is_pinned, created_at")
        .in("person_id", projectPersonIds)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
    : { data: [] };
  const { data: guestArtistLinks } = assignmentRows.length
    ? await supabase
        .from("external_links")
        .select("id, local_entity_id, external_id, sync_status, metadata")
        .eq("local_entity_type", "role_assignment")
        .eq("external_app", "theatre_budget")
        .eq("external_schema", "app_theatre_budget")
        .eq("external_table", "guest_artists")
        .in(
          "local_entity_id",
          assignmentRows.map((assignment) => assignment.id)
        )
    : { data: [] };
  const theatreBudgetGuestArtists = await fetchTheatreBudgetGuestArtists();
  const notes = (personNotes ?? []) as PersonNote[];
  const budgetLinks = (guestArtistLinks ?? []) as ExternalLink[];
  const budgetLinksByAssignmentId = new Map(budgetLinks.map((link) => [link.local_entity_id, link]));
  const budgetGuestArtistsById = new Map(theatreBudgetGuestArtists.data.map((artist) => [artist.id, artist]));
  const rolesById = new Map(roles.map((role) => [role.id, role]));
  const peopleById = new Map(peopleRows.map((person) => [person.id, person]));
  const runRows = items.filter((item) => item.is_run_of_show_relevant).sort(compareRunOfShowItems);
  const projectLocationRows = (projectLocations ?? []) as unknown as ProjectLocation[];
  const groups = (timelineGroups ?? []) as TimelineGroup[];
  const activeGroups = groups.filter((group) => group.is_active);
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const linkedLocationIds = new Set(projectLocationRows.map((projectLocation) => projectLocation.location_id));
  const availableProjectLocations = locations.filter((location) => !linkedLocationIds.has(location.id));
  const timeline = getTimeline(typedProject, items);
  const ganttSections = buildGanttSections(items, groups);
  const serializedGanttSections: ProjectGanttSection[] = ganttSections.map((section) => ({
    id: section.group?.id ?? "ungrouped",
    name: section.group?.name ?? "Ungrouped",
    color_key: section.group?.color_key ?? "gray",
    is_active: section.group?.is_active ?? true,
    is_ungrouped: !section.group,
    items: section.items.map((item) => ({
      id: item.id,
      title: item.title,
      item_type: item.item_type,
      department: item.department,
      location: item.location,
      starts_at: item.starts_at,
      ends_at: item.ends_at,
      due_at: item.due_at
    })),
    range: section.range
      ? {
          start: section.range.start.toISOString(),
          end: section.range.end.toISOString()
        }
      : null
  }));

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
      {query?.success ? <p className="setup-success">{query.success}</p> : null}

      <nav className="workspace-nav" aria-label="Project workspace sections">
        <a href="#calendar">Calendar</a>
        <a href="#gantt">Gantt</a>
        <a href="#timeline-groups">Timeline Groups</a>
        <a href="#roles">Roles</a>
        <a href="#people">People</a>
        <a href="#assignments">Assignments</a>
        <a href="#run-of-show">Run of Show</a>
      </nav>

      <section className="workspace-summary" aria-label="Project summary">
        <div>
          <span>{items.length}</span>
          <p>Calendar Items</p>
        </div>
        <div>
          <span>{assignmentRows.length}</span>
          <p>Assignments</p>
        </div>
        <div>
          <span>{projectPersonIds.length}</span>
          <p>Project People</p>
        </div>
        <div>
          <span>{assignmentRows.filter((assignment) => assignment.is_guest_artist).length}</span>
          <p>Guest Artists</p>
        </div>
      </section>

      <ProjectCalendar
        calendarItemTypes={calendarItemTypes.map((itemType) => ({
          id: itemType.id,
          label: itemType.label,
          value: itemType.slug
        }))}
        departments={departments.map((department) => ({
          id: department.id,
          label: department.name,
          value: department.id
        }))}
        items={items}
        locations={locations.map((location) => ({
          id: location.id,
          label: location.name,
          value: location.id
        }))}
        projectId={typedProject.id}
        timelineGroups={activeGroups.map((group) => ({
          id: group.id,
          label: group.name,
          value: group.id,
          isActive: group.is_active
        }))}
      />

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

      <div className="workspace-grid single">
        <section className="panel workspace-main" id="gantt">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Production Calendar</p>
              <h2>Gantt</h2>
              <p className="muted">Timeline groups start collapsed. Open a group to inspect its calendar items.</p>
            </div>
          </div>
          <ProjectGantt
            sections={serializedGanttSections}
            timeline={{
              start: timeline.start.toISOString(),
              weeks: timeline.weeks.map((week) => week.toISOString())
            }}
          />
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
              <p className="muted">Define the roles this project needs before assigning people into them.</p>
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
              roles.map((role) => {
                const roleGroupStillActive = roleGroups.some((roleGroup) => roleGroup.slug === role.role_group);

                return (
                  <details className="editable-row" key={role.id}>
                    <summary>
                      <div>
                        <strong>{role.name}</strong>
                        <span>
                          {titleCase(role.role_group)}
                          {role.department ? ` · ${role.department}` : ""}
                        </span>
                      </div>
                    </summary>
                    <form action={updateProjectRoleAction} className="role-edit-form">
                      <input name="projectId" type="hidden" value={typedProject.id} />
                      <input name="id" type="hidden" value={role.id} />
                      <input name="existingDepartment" type="hidden" value={role.department} />
                      <label className="field">
                        <span>Role name</span>
                        <input name="name" defaultValue={role.name} required />
                      </label>
                      <label className="field">
                        <span>Role group</span>
                        <select name="roleGroup" defaultValue={role.role_group}>
                          {!roleGroupStillActive ? (
                            <option value={role.role_group}>{titleCase(role.role_group)} (inactive)</option>
                          ) : null}
                          {roleGroups.map((roleGroup) => (
                            <option key={roleGroup.id} value={roleGroup.slug}>
                              {roleGroup.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Change department</span>
                        <select name="departmentId" defaultValue="">
                          <option value="">Keep {role.department || "none"}</option>
                          {departments.map((department) => (
                            <option key={department.id} value={department.id}>
                              {department.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="submit">Save role</button>
                    </form>
                  </details>
                );
              })
            ) : (
              <p className="muted">No roles yet.</p>
            )}
          </div>
        </section>

        <section className="panel" id="people">
          <div className="section-heading">
            <div>
              <p className="eyebrow">People Files</p>
              <h2>Add Person</h2>
              <p className="muted">Create durable profiles that can later connect to Playbill, auditions, and recognition.</p>
            </div>
          </div>
          <form action={createPersonAction} className="stacked-form">
            <input name="projectId" type="hidden" value={typedProject.id} />
            <div className="form-row">
              <label className="field">
                <span>Full name</span>
                <input name="fullName" required />
              </label>
              <label className="field">
                <span>Email</span>
                <input name="email" type="email" />
              </label>
            </div>
            <label className="field">
              <span>Vendor / 90#</span>
              <input name="vendorNumber" placeholder="902243554" />
            </label>
            <div className="form-row">
              <label className="field">
                <span>First name</span>
                <input name="firstName" />
              </label>
              <label className="field">
                <span>Last name</span>
                <input name="lastName" />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                <span>Preferred name</span>
                <input name="preferredName" />
              </label>
              <label className="field">
                <span>Pronouns</span>
                <input name="pronouns" />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                <span>Phone</span>
                <input name="phone" />
              </label>
              <label className="field">
                <span>Person type</span>
                <select name="personType" defaultValue="person">
                  <option value="person">Person</option>
                  <option value="student">Student</option>
                  <option value="staff">Staff</option>
                  <option value="faculty">Faculty</option>
                  <option value="guest_artist">Guest artist</option>
                  <option value="vendor_contact">Vendor contact</option>
                  <option value="client">Client</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Affiliation</span>
              <input name="affiliation" placeholder="Siena student, guest designer, external client..." />
            </label>
            <button type="submit">Create person</button>
          </form>
        </section>
      </div>

      <section className="panel workspace-section" id="assignments">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Main MVP Spine</p>
            <h2>Role Assignments</h2>
            <p className="muted">
              Assign people to project roles. Guest artist is tracked on the assignment for future Theatre Budget sync.
            </p>
          </div>
        </div>
        <form action={createRoleAssignmentAction} className="assignment-create-form">
          <input name="projectId" type="hidden" value={typedProject.id} />
          <label className="field">
            <span>Role</span>
            <select name="roleId" defaultValue="" required>
              <option value="">Choose role</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name} ({titleCase(role.role_group)})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Person</span>
            <select name="personId" defaultValue="" required>
              <option value="">Choose person</option>
              {peopleRows.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}
                  {person.email ? ` · ${person.email}` : ""}
                </option>
              ))}
            </select>
          </label>
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
          <label className="checkbox-card">
            <input name="isGuestArtist" type="checkbox" />
            <span>
              <strong>Is Guest Artist</strong>
              <small>Prepare this assignment for Theatre Budget guest artist sync.</small>
            </span>
          </label>
          <label className="field assignment-notes-field">
            <span>Assignment notes</span>
            <textarea name="notes" rows={2} />
          </label>
          <button type="submit">Assign person</button>
        </form>

        <div className="assignment-list">
          {assignmentRows.length ? (
            assignmentRows.map((assignment) => {
              const role = rolesById.get(assignment.role_id);
              const person = peopleById.get(assignment.person_id);
              const budgetLink = budgetLinksByAssignmentId.get(assignment.id);
              const linkedGuestArtist = budgetLink ? budgetGuestArtistsById.get(budgetLink.external_id) : null;
              const guestArtistSuggestions = suggestedGuestArtistMatches(person, theatreBudgetGuestArtists.data);

              return (
                <details className="assignment-card" key={assignment.id}>
                  <summary>
                    <div>
                      <strong>{person?.full_name ?? "Unknown person"}</strong>
                      <span>
                        {role?.name ?? "Unknown role"} · {titleCase(assignment.status)} · Confirmation{" "}
                        {titleCase(assignment.confirmation_status)}
                      </span>
                    </div>
                    <div className="badge-row">
                      {assignment.is_guest_artist ? <span className="status-badge gold">Guest Artist</span> : null}
                      <span className="status-badge">Playbill {titleCase(assignment.playbill_sync_status)}</span>
                      <span className="status-badge">
                        Budget {budgetLink ? "Linked" : titleCase(assignment.guest_artist_sync_status)}
                      </span>
                    </div>
                  </summary>
                  {assignment.is_guest_artist ? (
                    <div className="integration-panel">
                      <div>
                        <strong>Theatre Budget Guest Artist</strong>
                        <p className="muted">
                          Read-only lookup. Linking stores a Production Management external link and does not edit Theatre Budget.
                        </p>
                      </div>
                      {theatreBudgetGuestArtists.error ? (
                        <p className="setup-warning">{theatreBudgetGuestArtists.error}</p>
                      ) : linkedGuestArtist ? (
                        <div className="linked-record">
                          <div>
                            <strong>{linkedGuestArtist.display_name}</strong>
                            <span>
                              {linkedGuestArtist.email ?? "No email"}
                              {linkedGuestArtist.vendor_number ? ` · Vendor ${linkedGuestArtist.vendor_number}` : ""}
                              {!linkedGuestArtist.active ? " · Inactive" : ""}
                            </span>
                          </div>
                          <form action={unlinkTheatreBudgetGuestArtistAction}>
                            <input name="projectId" type="hidden" value={typedProject.id} />
                            <input name="assignmentId" type="hidden" value={assignment.id} />
                            <button className="button secondary" type="submit">
                              Unlink
                            </button>
                          </form>
                        </div>
                      ) : (
                        <form action={linkTheatreBudgetGuestArtistAction} className="guest-artist-link-form">
                          <input name="projectId" type="hidden" value={typedProject.id} />
                          <input name="assignmentId" type="hidden" value={assignment.id} />
                          <label className="field">
                            <span>Existing Theatre Budget guest artist</span>
                            <select name="guestArtistId" defaultValue="" required>
                              <option value="">Choose existing guest artist</option>
                              {guestArtistSuggestions.length ? (
                                <optgroup label="Suggested matches">
                                  {guestArtistSuggestions.map((artist) => (
                                    <option key={artist.id} value={artist.id}>
                                      {artist.display_name}
                                      {artist.email ? ` · ${artist.email}` : ""}
                                      {!artist.active ? " · Inactive" : ""}
                                    </option>
                                  ))}
                                </optgroup>
                              ) : null}
                              <optgroup label="All guest artists">
                                {theatreBudgetGuestArtists.data.map((artist) => (
                                  <option key={artist.id} value={artist.id}>
                                    {artist.display_name}
                                    {artist.email ? ` · ${artist.email}` : ""}
                                    {!artist.active ? " · Inactive" : ""}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                          </label>
                          <button type="submit">Link existing artist</button>
                        </form>
                      )}
                    </div>
                  ) : null}
                  <form action={updateRoleAssignmentAction} className="assignment-edit-form">
                    <input name="projectId" type="hidden" value={typedProject.id} />
                    <input name="id" type="hidden" value={assignment.id} />
                    <input name="roleId" type="hidden" value={assignment.role_id} />
                    <input name="personId" type="hidden" value={assignment.person_id} />
                    <label className="field">
                      <span>Status</span>
                      <select name="status" defaultValue={assignment.status}>
                        <option value="draft">Draft</option>
                        <option value="offered">Offered</option>
                        <option value="accepted">Accepted</option>
                        <option value="declined">Declined</option>
                        <option value="withdrawn">Withdrawn</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Confirmation</span>
                      <select name="confirmationStatus" defaultValue={assignment.confirmation_status}>
                        <option value="not_sent">Not sent</option>
                        <option value="sent">Sent</option>
                        <option value="accepted">Accepted</option>
                        <option value="declined">Declined</option>
                        <option value="bounced">Bounced</option>
                      </select>
                    </label>
                    <label className="checkbox-card">
                      <input name="isGuestArtist" type="checkbox" defaultChecked={assignment.is_guest_artist} />
                      <span>
                        <strong>Is Guest Artist</strong>
                        <small>Changing this prepares future Theatre Budget guest artist sync.</small>
                      </span>
                    </label>
                    <label className="field assignment-notes-field">
                      <span>Assignment notes</span>
                      <textarea name="notes" rows={3} defaultValue={assignment.notes} />
                    </label>
                    <div className="form-actions">
                      <button type="submit">Save assignment</button>
                    </div>
                  </form>
                  <form action={deleteRoleAssignmentAction}>
                    <input name="projectId" type="hidden" value={typedProject.id} />
                    <input name="id" type="hidden" value={assignment.id} />
                    <button className="button danger" type="submit">
                      Remove assignment
                    </button>
                  </form>
                </details>
              );
            })
          ) : (
            <p className="muted">No role assignments yet. Create people and roles, then assign them here.</p>
          )}
        </div>
      </section>

      <section className="panel workspace-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">People Files</p>
            <h2>Project People Notes</h2>
            <p className="muted">Keep internal and client-visible notes attached to durable person files.</p>
          </div>
        </div>
        <form action={addPersonNoteAction} className="person-note-form">
          <input name="projectId" type="hidden" value={typedProject.id} />
          <label className="field">
            <span>Person</span>
            <select name="personId" defaultValue="" required>
              <option value="">Choose project person</option>
              {projectPersonIds.map((personId) => {
                const person = peopleById.get(personId);
                return person ? (
                  <option key={person.id} value={person.id}>
                    {person.full_name}
                  </option>
                ) : null;
              })}
            </select>
          </label>
          <label className="field">
            <span>Visibility</span>
            <select name="visibility" defaultValue="internal">
              <option value="internal">Internal</option>
              <option value="client_visible">Client visible</option>
            </select>
          </label>
          <label className="checkbox-card compact">
            <input name="isPinned" type="checkbox" />
            <span>
              <strong>Pin</strong>
            </span>
          </label>
          <label className="field person-note-text">
            <span>Note</span>
            <textarea name="note" rows={3} required />
          </label>
          <button type="submit">Add note</button>
        </form>

        <div className="people-file-grid">
          {projectPersonIds.length ? (
            projectPersonIds.map((personId) => {
              const person = peopleById.get(personId);
              const personAssignments = assignmentRows.filter((assignment) => assignment.person_id === personId);
              const personNoteRows = notes.filter((note) => note.person_id === personId);

              if (!person) {
                return null;
              }

              return (
                <article className="person-file-card" key={person.id}>
                  <header>
                    <div>
                      <h3>{person.full_name}</h3>
                      <p className="muted">
                        {titleCase(person.person_type)}
                        {person.affiliation ? ` · ${person.affiliation}` : ""}
                        {person.vendor_number ? ` · 90# ${person.vendor_number}` : ""}
                        {person.email ? ` · ${person.email}` : ""}
                      </p>
                    </div>
                  </header>
                  <div className="mini-stack">
                    <strong>Project roles</strong>
                    {personAssignments.map((assignment) => {
                      const role = rolesById.get(assignment.role_id);
                      return (
                        <span key={assignment.id}>
                          {role?.name ?? "Unknown role"} · {titleCase(assignment.status)}
                          {assignment.is_guest_artist ? " · Guest Artist" : ""}
                        </span>
                      );
                    })}
                  </div>
                  <div className="mini-stack">
                    <strong>Notes</strong>
                    {personNoteRows.length ? (
                      personNoteRows.map((note) => (
                        <span key={note.id}>
                          {note.is_pinned ? "Pinned · " : ""}
                          {note.visibility === "client_visible" ? "Client visible" : "Internal"} · {note.note}
                        </span>
                      ))
                    ) : (
                      <span>No notes yet.</span>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <p className="muted">No project people yet.</p>
          )}
        </div>
      </section>

      <div className="grid two workspace-lower">
        <section className="panel" id="run-of-show">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Event Flow</p>
              <h2>Run of Show</h2>
              <p className="muted">Run-of-show rows are calendar items marked for this view.</p>
            </div>
          </div>
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
                      {row.location ? ` · ${row.location}` : ""}
                      {row.department ? ` · ${row.department}` : ""}
                    </span>
                    {row.run_of_show_notes ? <span>{row.run_of_show_notes}</span> : null}
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
