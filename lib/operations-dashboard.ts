import { createSupabaseServerClient } from "@/lib/supabase-server";
import { severityForDate, sortOperationItems, type OperationItem, type OperationSeverity } from "@/lib/operations-dashboard-model";

export type OperationsProject = {
  id: string;
  title: string;
  status: string;
  starts_on: string | null;
  ends_on: string | null;
};

type PersonJoin = { full_name?: string; preferred_name?: string; email?: string } | null;
type RoleJoin = { name?: string; role_group?: string } | null;

function joined<T>(value: unknown) {
  if (Array.isArray(value)) return (value[0] ?? null) as T | null;
  return (value ?? null) as T | null;
}

function personName(person: PersonJoin) {
  return person?.preferred_name || person?.full_name || person?.email || "Assigned person";
}

function issueSeverity(status: string, dueAt: string | null, now: Date): OperationSeverity {
  if (status === "failed" || (dueAt && new Date(dueAt).getTime() < now.getTime())) return "urgent";
  return severityForDate(dueAt, now);
}

export async function loadOperationsDashboard(projects: OperationsProject[], now = new Date()) {
  const projectIds = projects.map((project) => project.id);
  if (!projectIds.length) return { items: [] as OperationItem[], warnings: [] as string[] };
  const supabase = await createSupabaseServerClient();
  const upperDate = new Date(now.getTime() + 30 * 86400000).toISOString();

  const [settingsResult, publicityResult, rolesResult, assignmentsResult, googleSettingsResult, auditionsResult, communicationsResult, calendarResult, linksResult] = await Promise.all([
    supabase.from("project_publicity_settings").select("project_id, bio_due_on, headshot_due_on").in("project_id", projectIds),
    supabase.from("project_publicity_submissions").select("id, project_id, person_id, credited_name, bio, headshot_url, status, playbill_sync_status, playbill_sync_error, people(full_name, preferred_name, email)").in("project_id", projectIds),
    supabase.from("project_roles").select("id, project_id, name, playbill_sync_status, sync_notes").in("project_id", projectIds),
    supabase.from("role_assignments").select("id, project_id, person_id, status, is_guest_artist, playbill_sync_status, guest_artist_sync_status, sync_notes, google_group_sync_status, google_group_sync_error, google_automation_skipped, welcome_email_status, welcome_email_error, people(full_name, preferred_name, email), project_roles(name, role_group)").in("project_id", projectIds).not("status", "in", "(declined,withdrawn)"),
    supabase.from("project_role_group_google_settings").select("project_id, role_group, active_google_group_email, google_group_sync_enabled, welcome_email_enabled, welcome_email_template_id").in("project_id", projectIds),
    supabase.from("audition_sessions").select("id, project_id, title, starts_at, booking_closes_at, is_published").in("project_id", projectIds).eq("is_published", true).lte("starts_at", upperDate),
    supabase.from("communication_campaigns").select("id, project_id, name, status, recipient_count, sent_count, failed_count").in("project_id", projectIds).in("status", ["partial", "sending"]),
    supabase.from("calendar_items").select("id, project_id, title, item_type, status, starts_at, due_at").in("project_id", projectIds).not("status", "in", "(completed,cancelled)").or(`due_at.lte.${upperDate},starts_at.lte.${upperDate}`),
    supabase.from("external_links").select("local_entity_type, local_entity_id").eq("external_app", "playbill").eq("external_table", "shows").in("local_entity_id", projectIds)
  ]);

  const warnings = [settingsResult, publicityResult, rolesResult, assignmentsResult, googleSettingsResult, auditionsResult, communicationsResult, calendarResult, linksResult]
    .map((result) => result.error?.message)
    .filter((message): message is string => Boolean(message));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const items: OperationItem[] = [];

  function add(item: Omit<OperationItem, "projectTitle">) {
    const project = projectById.get(item.projectId);
    if (!project) return;
    items.push({ ...item, projectTitle: project.title });
  }

  const settingsByProject = new Map((settingsResult.data ?? []).map((row) => [String(row.project_id), row]));
  const publicityPersonKeys = new Set<string>();
  for (const row of publicityResult.data ?? []) {
    const projectId = String(row.project_id);
    const person = joined<PersonJoin>(row.people);
    const name = String(row.credited_name || personName(person));
    publicityPersonKeys.add(`${projectId}:${row.person_id}`);
    const settings = settingsByProject.get(projectId);
    const bioDue = settings?.bio_due_on ? `${settings.bio_due_on}T23:59:59` : null;
    const headshotDue = settings?.headshot_due_on ? `${settings.headshot_due_on}T23:59:59` : null;
    if (!String(row.bio ?? "").trim()) add({ id: `publicity-bio-${row.id}`, projectId, category: "publicity", kind: "attention", severity: issueSeverity("missing", bioDue, now), title: `${name} needs a bio`, detail: "The production publicity copy has no bio.", href: `/projects/${projectId}/publicity`, dueAt: bioDue });
    if (!String(row.headshot_url ?? "").trim()) add({ id: `publicity-headshot-${row.id}`, projectId, category: "publicity", kind: "attention", severity: issueSeverity("missing", headshotDue, now), title: `${name} needs a headshot`, detail: "The production publicity copy has no headshot.", href: `/projects/${projectId}/publicity`, dueAt: headshotDue });
    if (["draft", "awaiting_person_approval", "changes_requested"].includes(String(row.status))) {
      const detail = row.status === "awaiting_person_approval" ? "Waiting for the person to approve their production copy." : row.status === "changes_requested" ? "The person requested changes to the production copy." : "The production copy has not been sent for person approval.";
      add({ id: `publicity-approval-${row.id}`, projectId, category: "publicity", kind: "attention", severity: issueSeverity(String(row.status), bioDue ?? headshotDue, now), title: `${name}: publicity approval pending`, detail, href: `/projects/${projectId}/publicity`, dueAt: bioDue ?? headshotDue });
    }
    if (["failed", "disabled"].includes(String(row.playbill_sync_status))) add({ id: `publicity-sync-${row.id}`, projectId, category: "playbill", kind: "attention", severity: row.playbill_sync_status === "failed" ? "urgent" : "warning", title: `${name}: publicity not sent to Playbill`, detail: String(row.playbill_sync_error || `Playbill sync is ${row.playbill_sync_status}.`), href: `/projects/${projectId}/publicity`, dueAt: null });
  }

  const assignments = assignmentsResult.data ?? [];
  const publicityProjects = new Set([...(settingsResult.data ?? []).map((row) => String(row.project_id)), ...(publicityResult.data ?? []).map((row) => String(row.project_id))]);
  const missingPreparedPeople = new Set<string>();
  for (const row of assignments) {
    const projectId = String(row.project_id);
    const personKey = `${projectId}:${row.person_id}`;
    if (publicityProjects.has(projectId) && !publicityPersonKeys.has(personKey) && !missingPreparedPeople.has(personKey)) {
      missingPreparedPeople.add(personKey);
      const person = joined<PersonJoin>(row.people);
      add({ id: `publicity-unprepared-${personKey}`, projectId, category: "publicity", kind: "attention", severity: "warning", title: `${personName(person)} has no publicity record`, detail: "Prepare assigned people on the Publicity dashboard before requesting approval.", href: `/projects/${projectId}/publicity`, dueAt: null });
    }
  }

  const playbillLinkedProjects = new Set((linksResult.data ?? []).filter((row) => row.local_entity_type === "project").map((row) => String(row.local_entity_id)));
  for (const row of rolesResult.data ?? []) {
    const status = String(row.playbill_sync_status);
    if (status === "failed" || (playbillLinkedProjects.has(String(row.project_id)) && ["not_ready", "pending"].includes(status))) add({ id: `playbill-role-${row.id}`, projectId: String(row.project_id), category: "playbill", kind: "attention", severity: status === "failed" ? "urgent" : "warning", title: `${row.name}: Playbill role sync ${status.replace(/_/g, " ")}`, detail: String(row.sync_notes || "Open integrations to sync or reconcile this role."), href: `/projects/${row.project_id}/integrations`, dueAt: null });
  }

  const googleSettings = new Map((googleSettingsResult.data ?? []).map((row) => [`${row.project_id}:${row.role_group}`, row]));
  for (const row of assignments) {
    const projectId = String(row.project_id);
    const person = joined<PersonJoin>(row.people);
    const role = joined<RoleJoin>(row.project_roles);
    const name = personName(person);
    const roleName = role?.name || "assigned role";
    const playbillStatus = String(row.playbill_sync_status);
    if (playbillStatus === "failed" || (playbillLinkedProjects.has(projectId) && playbillStatus === "pending")) add({ id: `playbill-assignment-${row.id}`, projectId, category: "playbill", kind: "attention", severity: playbillStatus === "failed" ? "urgent" : "warning", title: `${name}: Playbill assignment sync ${playbillStatus.replace(/_/g, " ")}`, detail: String(row.sync_notes || roleName), href: `/projects/${projectId}/integrations`, dueAt: null });
    if (row.is_guest_artist && !["synced", "disabled"].includes(String(row.guest_artist_sync_status))) add({ id: `budget-${row.id}`, projectId, category: "budget", kind: "attention", severity: row.guest_artist_sync_status === "failed" ? "urgent" : "warning", title: `${name} needs a Theatre Budget link`, detail: `${roleName} · ${String(row.guest_artist_sync_status).replace(/_/g, " ")}`, href: `/projects/${projectId}/roles`, dueAt: null });
    if (row.google_automation_skipped) continue;
    const groupSettings = googleSettings.get(`${projectId}:${role?.role_group ?? ""}`);
    if (groupSettings?.google_group_sync_enabled && groupSettings.active_google_group_email && ["not_attempted", "missing", "failed"].includes(String(row.google_group_sync_status))) add({ id: `google-membership-${row.id}`, projectId, category: "google", kind: "attention", severity: row.google_group_sync_status === "failed" ? "urgent" : "warning", title: `${name}: Google Group membership ${String(row.google_group_sync_status).replace(/_/g, " ")}`, detail: String(row.google_group_sync_error || groupSettings.active_google_group_email), href: `/projects/${projectId}/google-groups`, dueAt: null });
    if (groupSettings?.welcome_email_enabled && groupSettings.welcome_email_template_id && ["not_attempted", "failed"].includes(String(row.welcome_email_status))) add({ id: `google-welcome-${row.id}`, projectId, category: "google", kind: "attention", severity: row.welcome_email_status === "failed" ? "urgent" : "warning", title: `${name}: welcome email ${String(row.welcome_email_status).replace(/_/g, " ")}`, detail: String(row.welcome_email_error || roleName), href: `/projects/${projectId}/google-groups`, dueAt: null });
  }

  for (const row of auditionsResult.data ?? []) {
    const projectId = String(row.project_id);
    const startsAt = String(row.starts_at);
    if (new Date(startsAt).getTime() >= now.getTime()) add({ id: `audition-start-${row.id}`, projectId, category: "auditions", kind: "upcoming", severity: severityForDate(startsAt, now), title: String(row.title), detail: "Audition block begins.", href: `/projects/${projectId}/auditions`, dueAt: startsAt });
    if (row.booking_closes_at && new Date(row.booking_closes_at).getTime() >= now.getTime()) add({ id: `audition-close-${row.id}`, projectId, category: "auditions", kind: "upcoming", severity: severityForDate(row.booking_closes_at, now), title: `${row.title}: booking closes`, detail: "Applicant self-booking deadline.", href: `/projects/${projectId}/auditions`, dueAt: row.booking_closes_at });
  }

  for (const row of communicationsResult.data ?? []) {
    const failed = Number(row.failed_count ?? 0);
    add({ id: `communications-${row.id}`, projectId: String(row.project_id), category: "communications", kind: "attention", severity: failed ? "urgent" : "warning", title: `${row.name}: communication ${row.status}`, detail: failed ? `${failed} of ${row.recipient_count} recipient deliveries failed. Retry sends only to failed recipients.` : "This campaign may have been interrupted while sending. Open it to review delivery states.", href: `/projects/${row.project_id}/communications?campaign=${row.id}`, dueAt: null });
  }

  for (const row of calendarResult.data ?? []) {
    const dueAt = row.due_at ?? row.starts_at;
    if (!dueAt) continue;
    const time = new Date(dueAt).getTime();
    const isDeadline = row.item_type === "deadline" || row.item_type === "milestone" || Boolean(row.due_at);
    if (!isDeadline || time > new Date(upperDate).getTime()) continue;
    add({ id: `calendar-${row.id}`, projectId: String(row.project_id), category: "calendar", kind: time < now.getTime() ? "attention" : "upcoming", severity: severityForDate(dueAt, now), title: String(row.title), detail: `${String(row.item_type).replace(/_/g, " ")} · ${String(row.status).replace(/_/g, " ")}`, href: `/projects/${row.project_id}/calendar`, dueAt });
  }

  return { items: sortOperationItems(items), warnings };
}
