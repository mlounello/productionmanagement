import Link from "next/link";
import nextDynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  addProjectLocationAction,
  archiveTimelineGroupAction,
  bulkAssignTheatreBudgetGuestArtistsAction,
  bulkCreateRoleAssignmentsAction,
  bulkCreateProjectRolesAction,
  copyProjectRolesAction,
  createAndLinkTheatreBudgetGuestArtistAction,
  createPersonAction,
  createProjectRoleAction,
  createRoleAssignmentAction,
  createTimelineGroupAction,
  deleteCalendarItemAction,
  deleteProjectAction,
  deleteRoleAssignmentAction,
  deleteRunOfShowItemAction,
  linkPlaybillShowAction,
  linkTheatreBudgetGuestArtistAction,
  removeProjectLocationAction,
  replaceRoleAssignmentPersonAction,
  syncAllProjectIntegrationsAction,
  syncProjectRoleToPlaybillAction,
  syncRoleAssignmentToPlaybillAction,
  unlinkPlaybillShowAction,
  unlinkTheatreBudgetGuestArtistAction,
  updateProjectRoleAction,
  updateRoleAssignmentAction
} from "@/app/projects/[projectId]/actions";
import type { ProjectGanttSection } from "@/components/project-gantt";
import { PeopleDirectory, type DirectoryPerson } from "@/components/people-directory";
import { ProjectWorkspaceNav } from "@/components/project-workspace-nav";
import { ProjectSwitcher } from "@/components/project-switcher";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { InlineHelp } from "@/components/ui/inline-help";
import { StatusBadge } from "@/components/ui/status-badge";
import { fetchPlaybillShowRoles, fetchPlaybillShows } from "@/lib/playbill";
import { fetchActiveDepartments, fetchActiveLocations, fetchActiveReferenceValues } from "@/lib/reference-data";
import { fetchTheatreBudgetGuestArtists, type TheatreBudgetGuestArtist } from "@/lib/theatre-budget";
import type { ProjectWorkspaceKey } from "@/lib/project-routes";

const ProjectCalendar = nextDynamic(() => import("@/components/project-calendar").then((module) => module.ProjectCalendar));
const ProjectGantt = nextDynamic(() => import("@/components/project-gantt").then((module) => module.ProjectGantt));
const BulkRoleImport = nextDynamic(() => import("@/components/bulk-role-import").then((module) => module.BulkRoleImport));
const BulkAssignmentForms = nextDynamic(() => import("@/components/bulk-assignment-forms").then((module) => module.BulkAssignmentForms));

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
  playbill_sync_status: string;
  sync_notes: string;
};

type Person = {
  id: string;
  full_name: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  preferred_name: string;
  email: string;
  vendor_number: string;
  phone: string;
  pronouns: string;
  affiliation: string;
  person_type: string;
  status: string;
  publicity_headshot_url: string;
  performance_interests:string[];technical_interests:string[];vocal_range:string;instruments:string;special_skills:string;performance_experience:string;technical_experience:string;certifications_training:string;dance_styles:string[];dance_experience:string;
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
  assignment_kind: string;
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

export default async function ProjectWorkspacePage({
  projectId,
  workspace,
  query
}: {
  projectId: string;
  workspace: ProjectWorkspaceKey;
  query?: { error?: string; success?: string };
}) {
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
  const needsCalendar = ["calendar", "timeline", "run-of-show"].includes(workspace);
  const needsRoles = ["overview", "roles", "people", "integrations"].includes(workspace);
  const needsPeople = ["overview", "roles", "people"].includes(workspace);
  const needsAssignments = ["overview", "roles", "people", "integrations"].includes(workspace);
  const needsCalendarSetup = workspace === "calendar";
  const needsTimelineGroups = workspace === "calendar" || workspace === "timeline";
  const needsRoleSetup = workspace === "roles";
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
    needsCalendar ? supabase
      .from("calendar_items")
      .select(
        "id, title, item_type, starts_at, ends_at, due_at, all_day, status, description, department, department_id, location, location_id, timeline_group_id, is_run_of_show_relevant, run_of_show_order, cue_number, duration_minutes, run_of_show_notes"
      )
      .eq("project_id", typedProject.id)
      .order("starts_at", { ascending: true }) : Promise.resolve({ data: [] }),
    needsRoles ? supabase
      .from("project_roles")
      .select("id, name, role_group, department, playbill_sync_status, sync_notes")
      .eq("project_id", typedProject.id)
      .order("role_group", { ascending: true })
      .order("name", { ascending: true }) : Promise.resolve({ data: [] }),
    needsPeople ? supabase
      .from("people")
      .select("id, full_name, first_name, middle_name, last_name, preferred_name, email, vendor_number, phone, pronouns, affiliation, person_type, status, publicity_headshot_url, performance_interests, technical_interests, vocal_range, instruments, special_skills, performance_experience, technical_experience, certifications_training, dance_styles, dance_experience")
      .order("full_name", { ascending: true }) : Promise.resolve({ data: [] }),
    needsAssignments ? supabase
      .from("role_assignments")
      .select(
        "id, role_id, person_id, status, confirmation_status, notes, is_guest_artist, playbill_sync_status, guest_artist_sync_status, assignment_kind"
      )
      .eq("project_id", typedProject.id)
      .order("created_at", { ascending: true }) : Promise.resolve({ data: [] }),
    needsCalendarSetup ? supabase
      .from("project_locations")
      .select("id, location_id, locations(id, name, building, room, is_active)")
      .eq("project_id", typedProject.id)
      .order("sort_order", { ascending: true }) : Promise.resolve({ data: [] }),
    needsTimelineGroups ? supabase
      .from("project_timeline_groups")
      .select("id, name, slug, description, color_key, sort_order, is_active")
      .eq("project_id", typedProject.id)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }) : Promise.resolve({ data: [] }),
    needsCalendarSetup || needsRoleSetup ? fetchActiveDepartments() : Promise.resolve([]),
    needsCalendarSetup ? fetchActiveLocations() : Promise.resolve([]),
    needsCalendarSetup ? fetchActiveReferenceValues("calendar_item_type") : Promise.resolve([]),
    needsRoleSetup ? fetchActiveReferenceValues("role_group") : Promise.resolve([])
  ]);

  const items = (calendarItems ?? []) as CalendarItem[];
  const roles = (projectRoles ?? []) as ProjectRole[];
  const peopleRows = (people ?? []) as Person[];
  const assignmentRows = (roleAssignments ?? []) as RoleAssignment[];
  const { data: projectOptions } = await supabase
    .from("projects")
    .select("id, title")
    .order("title", { ascending: true });
  const reusableRoleProjects = (projectOptions ?? []).filter((project) => project.id !== typedProject.id);
  const projectPersonIds = Array.from(new Set(assignmentRows.map((assignment) => assignment.person_id)));
  const { data: personNotes } = workspace === "people" && projectPersonIds.length
    ? await supabase
        .from("person_notes")
        .select("id, person_id, project_id, visibility, note, is_pinned, created_at")
        .in("person_id", projectPersonIds)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
    : { data: [] };
  const { data: personManagementDetails } = workspace === "people" && projectPersonIds.length
    ? await supabase
        .from("person_management_details")
        .select("person_id, notes")
        .in("person_id", projectPersonIds)
    : { data: [] };
  const { data: guestArtistLinks } = ["overview", "roles", "integrations"].includes(workspace) && assignmentRows.length
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
  const { data: assignmentPlaybillLinks } = ["roles", "integrations"].includes(workspace) && assignmentRows.length
    ? await supabase
        .from("external_links")
        .select("id, local_entity_id, external_id, external_table, sync_status, metadata")
        .eq("local_entity_type", "role_assignment")
        .eq("external_app", "playbill")
        .eq("external_schema", "app_playbill")
        .in(
          "local_entity_id",
          assignmentRows.map((assignment) => assignment.id)
        )
    : { data: [] };
  const { data: projectRolePlaybillLinks } = ["roles", "integrations"].includes(workspace) && roles.length
    ? await supabase
        .from("external_links")
        .select("id, local_entity_id, external_id, sync_status, metadata")
        .eq("local_entity_type", "project_role")
        .eq("external_app", "playbill")
        .eq("external_schema", "app_playbill")
        .eq("external_table", "show_roles")
        .in("local_entity_id", roles.map((role) => role.id))
    : { data: [] };
  const needsPlaybillWorkspace = workspace === "roles" || workspace === "integrations";
  const [{ data: playbillLinks }, theatreBudgetGuestArtists, playbillShows] = await Promise.all([
    needsPlaybillWorkspace ? supabase
      .from("external_links")
      .select("id, external_id, sync_status, metadata")
      .eq("local_entity_type", "project")
      .eq("local_entity_id", typedProject.id)
      .eq("external_app", "playbill")
      .eq("external_schema", "app_playbill")
      .eq("external_table", "shows") : Promise.resolve({ data: [] }),
    workspace === "roles" ? fetchTheatreBudgetGuestArtists() : Promise.resolve({ data: [], error: null }),
    needsPlaybillWorkspace ? fetchPlaybillShows() : Promise.resolve({ data: [], error: null })
  ]);
  const notes = (personNotes ?? []) as PersonNote[];
  const playbillLink = ((playbillLinks ?? []) as Array<Pick<ExternalLink, "id" | "external_id" | "sync_status" | "metadata">>)[0];
  const linkedPlaybillShow = playbillLink
    ? playbillShows.data.find((show) => show.id === playbillLink.external_id) ?? null
    : null;
  const linkedPlaybillMetadata = playbillLink?.metadata ?? {};
  const linkedPlaybillRoles = needsPlaybillWorkspace && linkedPlaybillShow ? await fetchPlaybillShowRoles(linkedPlaybillShow.id) : [];
  const budgetLinks = (guestArtistLinks ?? []) as ExternalLink[];
  const playbillAssignmentLinks = (assignmentPlaybillLinks ?? []) as Array<ExternalLink & { external_table: string }>;
  const playbillRoleLinksByRoleId = new Map(
    ((projectRolePlaybillLinks ?? []) as ExternalLink[]).map((link) => [link.local_entity_id, link])
  );
  const linkedPlaybillRoleIds = new Set([
    ...((projectRolePlaybillLinks ?? []) as ExternalLink[]).map((link) => link.external_id),
    ...playbillAssignmentLinks.filter((link) => link.external_table === "show_roles").map((link) => link.external_id)
  ]);
  const playbillOnlyRoles = linkedPlaybillRoles.filter((role) => !linkedPlaybillRoleIds.has(role.id));
  const roleSyncFailures = roles.filter((role) => role.playbill_sync_status === "failed");
  const roleMismatches = roles.filter((role) => {
    const link = playbillRoleLinksByRoleId.get(role.id);
    return link && String(link.metadata.role_name ?? "").trim() !== role.name.trim();
  });
  const assignmentSyncFailures = assignmentRows.filter((assignment) => assignment.playbill_sync_status === "failed");
  const budgetLinksByAssignmentId = new Map(budgetLinks.map((link) => [link.local_entity_id, link]));
  const unlinkedGuestAssignments = assignmentRows.filter(
    (assignment) => assignment.is_guest_artist && !budgetLinksByAssignmentId.has(assignment.id)
  );
  const playbillShowRoleLinksByAssignmentId = new Map(
    playbillAssignmentLinks
      .filter((link) => link.external_table === "show_roles")
      .map((link) => [link.local_entity_id, link])
  );
  const playbillRequestLinksByAssignmentId = new Map(
    playbillAssignmentLinks
      .filter((link) => link.external_table === "submission_requests")
      .map((link) => [link.local_entity_id, link])
  );
  const budgetGuestArtistsById = new Map(theatreBudgetGuestArtists.data.map((artist) => [artist.id, artist]));
  const rolesById = new Map(roles.map((role) => [role.id, role]));
  const peopleById = new Map(peopleRows.map((person) => [person.id, person]));
  const filledRoleIds = new Set(
    assignmentRows
      .filter((assignment) => !["declined", "withdrawn"].includes(assignment.status))
      .map((assignment) => assignment.role_id)
  );
  const assignedPersonIds = new Set(assignmentRows.map((assignment) => assignment.person_id));
  const assignedBudgetArtistIds = new Set(budgetLinks.map((link) => link.external_id));
  const availableAssignmentRoles = roles
    .filter((role) => !filledRoleIds.has(role.id))
    .sort((left, right) => left.name.localeCompare(right.name));
  const sortedPeople = [...peopleRows].sort((left, right) => left.full_name.localeCompare(right.full_name));
  const sortedProjectPersonIds = [...projectPersonIds].sort((left, right) =>
    (peopleById.get(left)?.full_name ?? "").localeCompare(peopleById.get(right)?.full_name ?? "")
  );
  const managementNotesByPersonId = new Map(
    (personManagementDetails ?? []).map((detail) => [detail.person_id, String(detail.notes ?? "")])
  );
  const projectDirectoryPeople: DirectoryPerson[] = sortedProjectPersonIds.flatMap((personId) => {
    const person = peopleById.get(personId);
    if (!person) return [];
    const personAssignments = assignmentRows.filter((assignment) => assignment.person_id === personId);
    const personNoteRows = notes.filter((note) => note.person_id === personId);
    return [{
      id: person.id,
      fullName: person.full_name,
      firstName: person.first_name ?? "",
      middleName: person.middle_name ?? "",
      lastName: person.last_name ?? "",
      preferredName: person.preferred_name ?? "",
      pronouns: person.pronouns ?? "",
      email: person.email ?? "",
      vendorNumber: person.vendor_number ?? "",
      phone: person.phone ?? "",
      affiliation: person.affiliation ?? "",
      personType: person.person_type ?? "person",
      status: person.status ?? "active",
      headshotUrl: person.publicity_headshot_url ?? "",
      managementNotes: managementNotesByPersonId.get(person.id) ?? "",
      performanceInterests:person.performance_interests??[],technicalInterests:person.technical_interests??[],vocalRange:person.vocal_range??"",instruments:person.instruments??"",specialSkills:person.special_skills??"",performanceExperience:person.performance_experience??"",technicalExperience:person.technical_experience??"",certificationsTraining:person.certifications_training??"",danceStyles:person.dance_styles??[],danceExperience:person.dance_experience??"",
      noteCount: personNoteRows.length,
      projectCount: 1,
      roles: personAssignments.map((assignment) => {
        const role = rolesById.get(assignment.role_id);
        return {
          id: assignment.id,
          name: role?.name ?? "Unknown role",
          group: role?.role_group ?? "other",
          status: assignment.status,
          projectTitle: typedProject.title,
          guestArtist: assignment.is_guest_artist
        };
      }),
      notes: personNoteRows.map((note) => ({
        id: note.id,
        note: note.note,
        visibility: note.visibility,
        pinned: note.is_pinned
      }))
    }];
  });
  const sortedBudgetGuestArtists = [...theatreBudgetGuestArtists.data].sort((left, right) =>
    left.display_name.localeCompare(right.display_name)
  );
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
          <ProjectSwitcher currentProjectId={typedProject.id} workspace={workspace} projects={projectOptions ?? [{ id: typedProject.id, title: typedProject.title }]} />
          <Link className="button" href={`/projects/${typedProject.id}/publicity`}>
            Publicity
          </Link>
          <Link className="button" href={`/projects/${typedProject.id}/auditions`}>
            Auditions
          </Link>
          <Link className="button secondary" href={`/projects/${typedProject.id}/google-groups`}>
            Google Groups
          </Link>
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

      <FeedbackBanner error={query?.error} success={query?.success} />

      <ProjectWorkspaceNav projectId={typedProject.id} active={workspace} />

      <section className="workspace-summary" aria-label="Project summary" hidden={workspace !== "overview"}>
        <div>
          <span>{roles.length}</span>
          <p>Project Roles</p>
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

      {workspace === "overview" ? (
        <section className="panel workspace-section">
          <div className="section-heading"><div><p className="eyebrow">Project At A Glance</p><h2>Choose your workspace</h2><p className="muted">Open a focused workspace above, or build reusable dashboard views from the modules you use most.</p></div><Link className="button" href={`/projects/${typedProject.id}/dashboards`}>Build a dashboard</Link></div>
          <div className="workspace-summary">
            <div><span>{availableAssignmentRoles.length}</span><p>Vacant Roles</p></div>
            <div><span>{runRows.length}</span><p>Run Items</p></div>
            <div><span>{roleSyncFailures.length + assignmentSyncFailures.length}</span><p>Sync Warnings</p></div>
            <div><span>{unlinkedGuestAssignments.length}</span><p>Budget Links Needed</p></div>
          </div>
        </section>
      ) : null}

      <section className="panel workspace-section" id="integrations" hidden={workspace !== "integrations"}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Integrations</p>
            <h2>Playbill Link</h2>
            <p className="muted">
              Link a draft show, push vacant roles, fill assignments, and reconcile Playbill and Theatre Budget status here.
            </p>
          </div>
        </div>
        <InlineHelp title="What synchronizes automatically"><p>Vacant Production Management roles can be sent to a linked draft Playbill show, and assigning a person fills the linked Playbill role. Published or locked Playbill records are protected from automatic overwrites.</p><p>Guest-artist records link to Theatre Budget without changing non-guest assignments. “Sync and reconcile all” retries safe pending work and reports anything that still needs a person to review.</p></InlineHelp>
        {playbillShows.error ? <p className="setup-warning">{playbillShows.error}</p> : null}
        {linkedPlaybillShow || playbillLink ? (
          <div className="linked-record">
            <div>
              <strong>{linkedPlaybillShow?.title ?? String(linkedPlaybillMetadata.title ?? "Linked Playbill show")}</strong>
              <span>
                {linkedPlaybillShow?.programs?.title
                  ? `${linkedPlaybillShow.programs.title} · `
                  : linkedPlaybillMetadata.program_title
                    ? `${String(linkedPlaybillMetadata.program_title)} · `
                    : ""}
                {linkedPlaybillShow?.status ?? String(linkedPlaybillMetadata.status ?? playbillLink?.sync_status ?? "linked")}
                {linkedPlaybillShow?.venue ? ` · ${linkedPlaybillShow.venue}` : ""}
                {linkedPlaybillShow?.programs?.show_dates ? ` · ${linkedPlaybillShow.programs.show_dates}` : ""}
              </span>
            </div>
            <form action={unlinkPlaybillShowAction}>
              <input name="projectId" type="hidden" value={typedProject.id} />
              <button className="button secondary" type="submit">
                Unlink
              </button>
            </form>
          </div>
        ) : (
          <form action={linkPlaybillShowAction} className="guest-artist-link-form">
            <input name="projectId" type="hidden" value={typedProject.id} />
            <label className="field">
              <span>Existing Playbill show</span>
              <select name="showId" defaultValue="" required>
                <option value="">Choose existing Playbill show</option>
                {playbillShows.data.map((show) => (
                  <option key={show.id} value={show.id}>
                    {show.title}
                    {show.programs?.title ? ` · ${show.programs.title}` : ""}
                    {show.venue ? ` · ${show.venue}` : ""}
                    {show.status ? ` · ${show.status}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Link Playbill show</button>
          </form>
        )}
        <div className="integration-panel">
          <div>
            <strong>Role Operations and Integration</strong>
            <p className="muted">One reconciliation view for role slots, assignments, Playbill, and guest-artist Budget links.</p>
          </div>
          <div className="workspace-summary" aria-label="Integration summary">
            <div><span>{playbillRoleLinksByRoleId.size}</span><p>Linked Roles</p></div>
            <div><span>{roles.filter((role) => !playbillRoleLinksByRoleId.has(role.id)).length}</span><p>Unlinked Roles</p></div>
            <div><span>{roleSyncFailures.length + assignmentSyncFailures.length}</span><p>Sync Failures</p></div>
            <div><span>{unlinkedGuestAssignments.length}</span><p>Budget Needed</p></div>
          </div>
          <form action={syncAllProjectIntegrationsAction}>
            <input name="projectId" type="hidden" value={typedProject.id} />
            <button type="submit">Sync and reconcile all</button>
          </form>
          {roleMismatches.length || playbillOnlyRoles.length ? (
            <div className="setup-warning">
              {roleMismatches.length ? `${roleMismatches.length} linked role name mismatch${roleMismatches.length === 1 ? "" : "es"}. ` : ""}
              {playbillOnlyRoles.length ? `${playbillOnlyRoles.length} Playbill-only role${playbillOnlyRoles.length === 1 ? "" : "s"} will not be overwritten automatically.` : ""}
            </div>
          ) : null}
          <div className="compact-list">
            {roles.map((role) => {
              const link = playbillRoleLinksByRoleId.get(role.id);
              const roleAssignmentsForRole = assignmentRows.filter((assignment) => assignment.role_id === role.id);
              return (
                <div className="table-row" key={`integration-${role.id}`}>
                  <div>
                    <strong>{role.name}</strong>
                    <span>{titleCase(role.role_group)} · {roleAssignmentsForRole.length ? `${roleAssignmentsForRole.length} assigned` : "Vacant"}</span>
                  </div>
                  <div className="badge-row">
                    <StatusBadge status={link ? (link.metadata.vacant ? "vacant" : "linked") : role.playbill_sync_status} label={`Playbill ${link ? (link.metadata.vacant ? "Vacant" : "Linked") : titleCase(role.playbill_sync_status)}`} />
                    {role.sync_notes ? <StatusBadge status="needs_review" label="Needs review" /> : null}
                  </div>
                </div>
              );
            })}
          </div>
          {playbillOnlyRoles.length ? (
            <details>
              <summary>Review Playbill-only roles</summary>
              <div className="compact-list">
                {playbillOnlyRoles.map((role) => (
                  <div className="table-row" key={`external-${role.id}`}>
                    <div><strong>{role.role_name}</strong><span>{titleCase(role.category)} · {role.person_id ? "Filled" : "Vacant"}</span></div>
                    <StatusBadge status="needs_review" label="Playbill only" />
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </section>

      <div hidden={workspace !== "calendar"}>
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
      </div>

      <section className="panel workspace-section" id="timeline-groups" hidden={workspace !== "timeline"}>
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

      <section className="panel workspace-section" hidden={workspace !== "calendar"}>
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

      <div className="workspace-grid single" hidden={workspace !== "timeline"}>
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

      <section className="panel workspace-section" hidden={workspace !== "calendar"}>
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
        <section className="panel" id="roles" hidden={workspace !== "roles"}>
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
          <BulkRoleImport
            projectId={typedProject.id}
            roleGroups={roleGroups.map((roleGroup) => ({ slug: roleGroup.slug, label: roleGroup.label }))}
            existingRoles={roles.map((role) => ({ name: role.name, role_group: role.role_group }))}
            action={bulkCreateProjectRolesAction}
          />
          {reusableRoleProjects?.length ? (
            <form action={copyProjectRolesAction} className="inline-create">
              <input name="projectId" type="hidden" value={typedProject.id} />
              <select name="sourceProjectId" defaultValue="" required>
                <option value="">Reuse all roles from a project</option>
                {reusableRoleProjects.map((sourceProject) => (
                  <option key={sourceProject.id} value={sourceProject.id}>{sourceProject.title}</option>
                ))}
              </select>
              <button type="submit">Copy missing roles</button>
            </form>
          ) : null}
          <div className="compact-list">
            {roles.length ? (
              roles.map((role) => {
                const roleGroupStillActive = roleGroups.some((roleGroup) => roleGroup.slug === role.role_group);
                const playbillRoleLink = playbillRoleLinksByRoleId.get(role.id);

                return (
                  <details className="editable-row" key={role.id}>
                    <summary>
                      <div>
                        <strong>{role.name}</strong>
                        <span>
                          {titleCase(role.role_group)}
                          {role.department ? ` · ${role.department}` : ""}
                          {playbillRoleLink ? ` · Playbill ${playbillRoleLink.metadata.vacant ? "vacant" : "filled"}` : ""}
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
                    {playbillLink ? (
                      <form action={syncProjectRoleToPlaybillAction} className="role-edit-form">
                        <input name="projectId" type="hidden" value={typedProject.id} />
                        <input name="roleId" type="hidden" value={role.id} />
                        <button type="submit">{playbillRoleLink ? "Resync Playbill role" : "Push vacant role to Playbill"}</button>
                      </form>
                    ) : null}
                  </details>
                );
              })
            ) : (
              <p className="muted">No roles yet.</p>
            )}
          </div>
        </section>

        <section className="panel" id="people" hidden={workspace !== "people"}>
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

      <section className="panel workspace-section" id="assignments" hidden={workspace !== "roles"}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Main MVP Spine</p>
            <h2>Role Assignments</h2>
            <p className="muted">
              Assign people to project roles. Guest artist is tracked on the assignment for future Theatre Budget sync.
            </p>
          </div>
        </div>
        <BulkAssignmentForms
          projectId={typedProject.id}
          roles={availableAssignmentRoles.map((role) => ({ id: role.id, label: `${role.name} (${titleCase(role.role_group)})` }))}
          people={sortedPeople.map((person) => ({ id: person.id, label: `${person.full_name}${assignedPersonIds.has(person.id) ? " *" : ""}${person.email ? ` · ${person.email}` : ""}` }))}
          guestArtists={sortedBudgetGuestArtists.map((artist) => ({
            id: artist.id,
            label: `${artist.display_name}${assignedBudgetArtistIds.has(artist.id) ? " *" : ""}${artist.email ? ` · ${artist.email}` : ""}${artist.vendor_number ? ` · Vendor ${artist.vendor_number}` : ""}${!artist.active ? " · Inactive" : ""}`
          }))}
          regularAction={bulkCreateRoleAssignmentsAction}
          budgetAction={bulkAssignTheatreBudgetGuestArtistsAction}
        />
        <InlineHelp title="Guest artists, repeat assignments, and filled roles"><p>Choose Theatre Budget guest artists from the guest-artist search when they already exist there. Use the regular person search for everyone else. Filled roles disappear from the new-assignment list; people remain available for multiple roles, and an asterisk means they already hold at least one role in this project.</p></InlineHelp>
        <p className="muted">
          Filled roles are hidden from new-assignment dropdowns. An asterisk (*) marks people and Theatre Budget guest artists who already hold a role in this project; they remain selectable for additional roles.
        </p>
        {theatreBudgetGuestArtists.error ? <p className="setup-warning">{theatreBudgetGuestArtists.error}</p> : null}
        <details className="integration-panel">
          <summary><strong>Detailed single assignment</strong><span>Use this form when you need status, confirmation, or notes immediately.</span></summary>
        <form action={createRoleAssignmentAction} className="assignment-create-form">
          <input name="projectId" type="hidden" value={typedProject.id} />
          <label className="field">
            <span>Role</span>
            <select name="roleId" defaultValue="" required>
              <option value="">Choose role</option>
              {availableAssignmentRoles.map((role) => (
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
              {sortedPeople.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}{assignedPersonIds.has(person.id) ? " *" : ""}
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
            <span>Assignment type</span>
            <select name="assignmentKind" defaultValue="primary">
              <option value="primary">Primary</option>
              <option value="shared">Shared role</option>
              <option value="understudy">Understudy</option>
              <option value="alternate">Alternate</option>
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
        </details>

        <div className="assignment-list">
          {assignmentRows.length ? (
            assignmentRows.map((assignment) => {
              const role = rolesById.get(assignment.role_id);
              const person = peopleById.get(assignment.person_id);
              const budgetLink = budgetLinksByAssignmentId.get(assignment.id);
              const linkedGuestArtist = budgetLink ? budgetGuestArtistsById.get(budgetLink.external_id) : null;
              const guestArtistSuggestions = suggestedGuestArtistMatches(person, theatreBudgetGuestArtists.data);
              const playbillShowRoleLink = playbillShowRoleLinksByAssignmentId.get(assignment.id);
              const playbillRequestLink = playbillRequestLinksByAssignmentId.get(assignment.id);

              return (
                <details className="assignment-card" key={assignment.id}>
                  <summary>
                    <div>
                      <strong>{person?.full_name ?? "Unknown person"}</strong>
                      <span>
                        {role?.name ?? "Unknown role"} · {titleCase(assignment.assignment_kind)}
                      </span>
                    </div>
                    <div className="badge-row">
                      <StatusBadge status={assignment.status} label={titleCase(assignment.status)} />
                      <StatusBadge status={assignment.confirmation_status} label={`Confirmation ${titleCase(assignment.confirmation_status)}`} />
                      {assignment.is_guest_artist ? <StatusBadge status="guest_artist" label="Guest Artist" /> : null}
                      <StatusBadge status={playbillShowRoleLink ? "linked" : assignment.playbill_sync_status} label={`Playbill ${playbillShowRoleLink ? "Linked" : titleCase(assignment.playbill_sync_status)}`} />
                      {assignment.is_guest_artist ? <StatusBadge status={budgetLink ? "linked" : assignment.guest_artist_sync_status} label={`Budget ${budgetLink ? "Linked" : titleCase(assignment.guest_artist_sync_status)}`} /> : null}
                    </div>
                  </summary>
                  <div className="integration-panel">
                    <div>
                      <strong>Playbill Draft Sync</strong>
                      <p className="muted">
                        Manual sync to the linked draft Playbill show. Creates or updates the Playbill person, show role,
                        and draft bio request for this assignment.
                      </p>
                    </div>
                    {playbillLink ? (
                      <div className="linked-record">
                        <div>
                          <strong>
                            {playbillShowRoleLink ? "Linked to Playbill role" : "Ready to sync to Playbill"}
                          </strong>
                          <span>
                            {linkedPlaybillShow?.title ?? String(linkedPlaybillMetadata.title ?? "Linked Playbill show")}
                            {playbillShowRoleLink ? ` · ${String(playbillShowRoleLink.metadata.role_name ?? role?.name ?? "Role")}` : ""}
                            {playbillRequestLink ? " · Bio request ready" : ""}
                          </span>
                        </div>
                        <form action={syncRoleAssignmentToPlaybillAction}>
                          <input name="projectId" type="hidden" value={typedProject.id} />
                          <input name="assignmentId" type="hidden" value={assignment.id} />
                          <button type="submit">{playbillShowRoleLink ? "Resync Playbill" : "Sync to Playbill"}</button>
                        </form>
                      </div>
                    ) : (
                      <p className="setup-warning">Link this project to a Playbill show before syncing assignments.</p>
                    )}
                  </div>
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
                                  {[...guestArtistSuggestions].sort((left, right) => left.display_name.localeCompare(right.display_name)).map((artist) => (
                                    <option key={artist.id} value={artist.id}>
                                      {artist.display_name}{assignedBudgetArtistIds.has(artist.id) ? " *" : ""}
                                      {artist.email ? ` · ${artist.email}` : ""}
                                      {!artist.active ? " · Inactive" : ""}
                                    </option>
                                  ))}
                                </optgroup>
                              ) : null}
                              <optgroup label="All guest artists">
                                {sortedBudgetGuestArtists.map((artist) => (
                                  <option key={artist.id} value={artist.id}>
                                    {artist.display_name}{assignedBudgetArtistIds.has(artist.id) ? " *" : ""}
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
                      {!linkedGuestArtist ? (
                        <details>
                          <summary>Create a new Theatre Budget guest artist</summary>
                          <form action={createAndLinkTheatreBudgetGuestArtistAction} className="guest-artist-link-form">
                            <input name="projectId" type="hidden" value={typedProject.id} />
                            <input name="assignmentId" type="hidden" value={assignment.id} />
                            <label className="checkbox-card">
                              <input name="confirmCreate" type="checkbox" required />
                              <span>
                                <strong>Confirm deliberate creation</strong>
                                <small>I checked the existing matches. Create only the identity/contact shell; financial and contract fields stay in Theatre Budget.</small>
                              </span>
                            </label>
                            <button type="submit">Create and link Budget artist</button>
                          </form>
                        </details>
                      ) : null}
                    </div>
                  ) : null}
                  <form action={replaceRoleAssignmentPersonAction} className="assignment-edit-form">
                    <input name="projectId" type="hidden" value={typedProject.id} />
                    <input name="assignmentId" type="hidden" value={assignment.id} />
                    <label className="field">
                      <span>Replace assigned person</span>
                      <select name="newPersonId" defaultValue="" required>
                        <option value="">Choose replacement</option>
                        {sortedPeople.filter((candidate) => candidate.id !== assignment.person_id).map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>{candidate.full_name}{assignedPersonIds.has(candidate.id) ? " *" : ""}{candidate.email ? ` · ${candidate.email}` : ""}</option>
                        ))}
                      </select>
                    </label>
                    <button className="button secondary" type="submit">Replace person in this role</button>
                  </form>
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
                    <label className="field">
                      <span>Assignment type</span>
                      <select name="assignmentKind" defaultValue={assignment.assignment_kind}>
                        <option value="primary">Primary</option>
                        <option value="shared">Shared role</option>
                        <option value="understudy">Understudy</option>
                        <option value="alternate">Alternate</option>
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

      <section className="panel workspace-section" hidden={workspace !== "people"}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Project Team</p>
            <h2>{projectDirectoryPeople.length} People</h2>
            <p className="muted">Search the team and select a row to edit contact details, review roles, or add project notes.</p>
          </div>
        </div>
        <PeopleDirectory
          people={projectDirectoryPeople}
          projectId={typedProject.id}
          returnTo={`/projects/${typedProject.id}/people`}
        />
      </section>

      <div className="grid two workspace-lower" hidden={workspace !== "run-of-show"}>
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
