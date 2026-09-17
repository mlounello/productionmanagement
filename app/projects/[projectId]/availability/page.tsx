import Link from "next/link";
import { notFound } from "next/navigation";
import { AvailabilityAccessManager } from "@/components/availability-access-manager";
import { CompanyAvailabilityViewer } from "@/components/company-availability-viewer";
import { ProjectWorkspaceNav } from "@/components/project-workspace-nav";
import { requireUser } from "@/lib/auth";
import { buildCompanyAvailabilityCalls, type CompanyAvailabilityPerson, type CompanyAvailabilityResponse } from "@/lib/company-availability";
import type { ConflictCalendarSnapshot, ConflictWindowSnapshot } from "@/lib/rehearsal-conflicts";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type AssignmentRow = { person_id: string; people: { full_name: string; preferred_name: string; email: string } | null; project_roles: { name: string; role_group: string } | null };
type ResponseRow = CompanyAvailabilityResponse & { windows_snapshot: ConflictWindowSnapshot[] };

export default async function CompanyAvailabilityPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const supabase = await createSupabaseServerClient();
  const [{ data: canViewProject }, { data: canViewApp }, { data: canManageProject }, { data: canManageApp }] = await Promise.all([
    supabase.rpc("has_project_role", { target_project_id: projectId, allowed_roles: ["project_manager", "producer", "department_head", "staff"] }),
    supabase.rpc("has_app_role", { allowed_roles: ["admin", "producer"] }),
    supabase.rpc("has_project_role", { target_project_id: projectId, allowed_roles: ["project_manager", "producer"] }),
    supabase.rpc("has_app_role", { allowed_roles: ["admin", "producer"] }),
  ]);
  const admin = createSupabaseAdminClient();
  const [{ data: signedInPerson }, dedicatedAccessResult] = await Promise.all([
    admin.from("people").select("id").eq("auth_user_id", user.id).maybeSingle(),
    admin.from("project_availability_viewers").select("id,person_id,active").eq("project_id", projectId).eq("active", true),
  ]);
  const hasDedicatedAccess = Boolean(signedInPerson && (dedicatedAccessResult.data ?? []).some((viewer) => viewer.person_id === signedInPerson.id));
  if (!canViewProject && !canViewApp && !hasDedicatedAccess) return <div className="page"><h1>Company Availability</h1><p>Authorized director or stage-management access is required.</p></div>;
  const canManage = Boolean(canManageProject || canManageApp);
  const [projectResult, windowsResult, calendarResult, responsesResult, assignmentsResult, offersResult, viewersResult] = await Promise.all([
    admin.from("projects").select("id,title").eq("id", projectId).maybeSingle(),
    admin.from("project_conflict_windows").select("id,label,recurrence_type,day_of_week,event_date,starts_at,ends_at,call_type,max_call_minutes,collect_preferences,applies_to,required,instructions,schedule_category,location,include_in_audition").eq("project_id", projectId).eq("active", true),
    admin.from("project_conflict_calendars").select("starts_on,ends_on,excluded_dates").eq("project_id", projectId).maybeSingle(),
    admin.from("rehearsal_conflict_responses").select("id,person_id,source_type,source_id,windows_snapshot,responses,one_off_conflicts,general_notes,submitted_at").eq("project_id", projectId).order("submitted_at", { ascending: false }),
    admin.from("role_assignments").select("person_id,people(full_name,preferred_name,email),project_roles(name,role_group)").eq("project_id", projectId).eq("status", "accepted"),
    admin.from("casting_offers").select("id,status").eq("project_id", projectId),
    canManage ? admin.from("project_availability_viewers").select("person_id,active,people(full_name,preferred_name,email)").eq("project_id", projectId) : Promise.resolve({ data: [], error: null }),
  ]);
  if (!projectResult.data) notFound();
  const loadError = [windowsResult.error, calendarResult.error, responsesResult.error, assignmentsResult.error, offersResult.error].find(Boolean);
  if (loadError) return <div className="page"><ProjectWorkspaceNav projectId={projectId} active="availability"/><p className="setup-warning">Company availability could not be loaded: {loadError.message}</p></div>;

  const projectPeople = new Map<string, CompanyAvailabilityPerson>();
  const roster = new Map<string, CompanyAvailabilityPerson>();
  for (const assignment of (assignmentsResult.data ?? []) as unknown as AssignmentRow[]) {
    const person = assignment.people, role = assignment.project_roles;
    if (!person || !role) continue;
    const current = projectPeople.get(assignment.person_id) ?? { id: assignment.person_id, name: person.preferred_name || person.full_name || "Company member", email: person.email || "", roles: [], roleGroups: [] };
    if (!current.roles.includes(role.name)) current.roles.push(role.name);
    if (!current.roleGroups.includes(role.role_group)) current.roleGroups.push(role.role_group);
    projectPeople.set(assignment.person_id, current);
  }
  for (const person of projectPeople.values()) {
    if (person.roleGroups.includes("cast")) roster.set(person.id, person);
  }
  const activeOfferIds = new Set((offersResult.data ?? []).filter((offer) => offer.status !== "superseded").map((offer) => offer.id));
  const responses = ((responsesResult.data ?? []) as unknown as ResponseRow[]).filter((response) => response.source_type !== "casting_offer" || activeOfferIds.has(response.source_id));
  const calls = buildCompanyAvailabilityCalls({ windows: (windowsResult.data ?? []) as ConflictWindowSnapshot[], calendar: (calendarResult.data ?? null) as ConflictCalendarSnapshot, people: [...roster.values()].sort((a,b) => a.name.localeCompare(b.name)), responses });

  const candidates = [...projectPeople.values()].map((person) => ({ id: person.id, name: person.name, email: person.email })).sort((a,b) => a.name.localeCompare(b.name));
  const viewers = ((viewersResult.data ?? []) as unknown as Array<{person_id:string;active:boolean;people:{full_name:string;preferred_name:string;email:string}|null}>).map((viewer) => ({ id: viewer.person_id, name: viewer.people?.preferred_name || viewer.people?.full_name || "Project viewer", email: viewer.people?.email || "", active: viewer.active }));
  return <div className="page workspace-page company-availability-page"><header className="page-header"><div><p className="eyebrow">Director &amp; Stage Management</p><h1>{projectResult.data.title} Cast Availability</h1><p className="muted">A live, read-only view of submitted conflicts for actors with accepted Cast assignments. Select a call or actor for details.</p></div>{canViewProject || canViewApp ? <div className="top-actions no-print"><Link className="button secondary" href={`/projects/${projectId}/conflicts`}>Schedule setup</Link><a className="button secondary" href={`/api/projects/${projectId}/conflicts/export`}>Download CSV</a></div> : null}</header>{canViewProject || canViewApp ? <div className="no-print"><ProjectWorkspaceNav projectId={projectId} active="availability"/></div> : null}
    {canManage ? dedicatedAccessResult.error ? <p className="setup-warning no-print">Apply the Company Availability viewer database update before sending dedicated access invitations.</p> : <AvailabilityAccessManager projectId={projectId} candidates={candidates} viewers={viewers}/> : null}
    {!calls.length ? <section className="panel empty-state"><h2>No dated calls are available yet</h2><p>Configure the rehearsal period and active schedule items in Schedule &amp; Conflicts. This viewer will populate automatically.</p>{canViewProject || canViewApp ? <Link className="button" href={`/projects/${projectId}/conflicts`}>Open schedule setup</Link> : null}</section> : <CompanyAvailabilityViewer calls={calls} people={[...roster.values()]}/>} 
  </div>;
}
