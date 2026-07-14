import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ProjectWorkspaceNav } from "@/components/project-workspace-nav";
import { DashboardViewEditor } from "@/components/dashboard-view-editor";
import { ProjectContextSwitcher } from "@/components/project-context-switcher";
import { dashboardModuleDefinitions, normalizeDashboardLayout, type DashboardLayoutItem } from "@/lib/dashboard-modules";
import { createDashboardViewAction, deleteDashboardViewAction, saveDashboardLayoutAction, setDefaultDashboardAction, updateDashboardDetailsAction } from "@/app/projects/[projectId]/dashboards/actions";

export const dynamic = "force-dynamic";

type DashboardView = { id: string; owner_user_id: string; name: string; is_default: boolean; visibility: string; layout: unknown; updated_at: string };
type RoleRow = { id: string; name: string; playbill_sync_status: string };
type AssignmentRow = { id: string; role_id: string; person_id: string; status: string; playbill_sync_status: string; guest_artist_sync_status: string };
type PublicityRow = { status: string; playbill_sync_status: string };

function formatDate(value: string | null) {
  if (!value) return "Unscheduled";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function moduleTitle(key: DashboardLayoutItem["key"]) {
  return dashboardModuleDefinitions.find((item) => item.key === key)?.label ?? key;
}

export default async function ProjectDashboardsPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams?: Promise<{ viewId?: string; error?: string; success?: string; edit?: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [{ data: project }, viewsResult, { data: roles }, { data: assignments }, { data: publicity }, { data: notes }] = await Promise.all([
    supabase.from("projects").select("id, title, status, starts_on, ends_on").eq("id", projectId).maybeSingle(),
    supabase.from("project_dashboard_views").select("id, owner_user_id, name, is_default, visibility, layout, updated_at").eq("project_id", projectId).order("is_default", { ascending: false }).order("updated_at", { ascending: false }),
    supabase.from("project_roles").select("id, name, playbill_sync_status").eq("project_id", projectId),
    supabase.from("role_assignments").select("id, role_id, person_id, status, playbill_sync_status, guest_artist_sync_status").eq("project_id", projectId),
    supabase.from("project_publicity_submissions").select("status, playbill_sync_status").eq("project_id", projectId),
    supabase.from("person_notes").select("id, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(10)
  ]);
  if (!project) notFound();
  const projectRow = project;

  const views = (viewsResult.data ?? []) as DashboardView[];
  const selected = views.find((view) => view.id === query?.viewId)
    ?? views.find((view) => view.owner_user_id === user.id && view.is_default)
    ?? views.find((view) => view.owner_user_id === user.id)
    ?? views[0]
    ?? null;
  const layout = normalizeDashboardLayout(selected?.layout);
  const roleRows = (roles ?? []) as RoleRow[];
  const assignmentRows = (assignments ?? []) as AssignmentRow[];
  const publicityRows = (publicity ?? []) as PublicityRow[];
  const activeAssignments = assignmentRows.filter((item) => !["declined", "withdrawn"].includes(item.status));
  const filledRoleIds = new Set(activeAssignments.map((item) => item.role_id));
  const integrationWarnings = roleRows.filter((item) => item.playbill_sync_status === "failed").length
    + assignmentRows.filter((item) => item.playbill_sync_status === "failed" || item.guest_artist_sync_status === "failed").length
    + publicityRows.filter((item) => item.playbill_sync_status === "failed").length;

  function renderModule(item: DashboardLayoutItem) {
    let content: React.ReactNode;
    if (item.key === "project_summary") content = <div className="dashboard-kpis"><div><strong>{projectRow.status}</strong><span>Status</span></div><div><strong>{formatDate(projectRow.starts_on)}</strong><span>Starts</span></div><div><strong>{formatDate(projectRow.ends_on)}</strong><span>Ends</span></div><div><strong>{new Set(activeAssignments.map((row) => row.person_id)).size}</strong><span>People</span></div></div>;
    else if (item.key === "role_status") content = <div className="dashboard-kpis"><div><strong>{roleRows.length}</strong><span>Total roles</span></div><div><strong>{filledRoleIds.size}</strong><span>Filled</span></div><div><strong>{Math.max(0, roleRows.length - filledRoleIds.size)}</strong><span>Vacant</span></div></div>;
    else if (item.key === "assignment_status") content = <div className="dashboard-kpis"><div><strong>{assignmentRows.length}</strong><span>Total</span></div><div><strong>{assignmentRows.filter((row) => row.status === "accepted").length}</strong><span>Accepted</span></div><div><strong>{assignmentRows.filter((row) => row.status === "offered").length}</strong><span>Offered</span></div></div>;
    else if (item.key === "publicity_status") content = <div className="dashboard-kpis"><div><strong>{publicityRows.length}</strong><span>Prepared</span></div><div><strong>{publicityRows.filter((row) => row.status === "awaiting_person_approval").length}</strong><span>Awaiting person</span></div><div><strong>{publicityRows.filter((row) => row.status === "approved").length}</strong><span>Approved</span></div></div>;
    else if (item.key === "integration_health") content = <div className="dashboard-kpis"><div><strong>{integrationWarnings}</strong><span>Warnings</span></div><div><strong>{publicityRows.filter((row) => row.playbill_sync_status === "synced").length}</strong><span>Publicity synced</span></div></div>;
    else content = <div className="dashboard-kpis"><div><strong>{new Set(activeAssignments.map((row) => row.person_id)).size}</strong><span>Project people</span></div><div><strong>{notes?.length ?? 0}</strong><span>Recent notes</span></div></div>;
    const moduleHref: Record<DashboardLayoutItem["key"], string> = {
      project_summary: `/projects/${projectId}/overview`,
      role_status: `/projects/${projectId}/roles`,
      assignment_status: `/projects/${projectId}/roles`,
      publicity_status: `/projects/${projectId}/publicity`,
      integration_health: `/projects/${projectId}/integrations`,
      people_notes: `/projects/${projectId}/people`
    };
    return <section className={`panel dashboard-module dashboard-module-${item.size}`} key={item.key}><div className="section-heading"><div><p className="eyebrow">Dashboard Module</p><h2>{moduleTitle(item.key)}</h2></div></div>{content}<Link className="dashboard-module-link" href={moduleHref[item.key]}>Open full workspace →</Link></section>;
  }

  const ownsSelected = selected?.owner_user_id === user.id;
  const saveAction = selected ? saveDashboardLayoutAction.bind(null, projectId, selected.id) : undefined;

  return (
    <div className="page workspace-page">
      <div className="page-header"><div><p className="eyebrow">Saved Dashboards</p><h1>{projectRow.title}</h1><p className="muted">Build focused views from the project modules you need, then switch between them instantly.</p></div><div className="top-actions"><ProjectContextSwitcher projectId={projectId} workspace="dashboards"/><Link className="button secondary" href={`/projects/${projectId}/overview`}>Project overview</Link></div></div>
      <ProjectWorkspaceNav projectId={projectId} active="dashboards" />
      {query?.error ? <p className="setup-warning">{query.error}</p> : null}{query?.success ? <p className="setup-success">{query.success}</p> : null}
      {viewsResult.error ? <p className="setup-warning">Saved dashboards need the latest database migration: {viewsResult.error.message}</p> : null}

      <section className="panel workspace-section">
        <div className="section-heading"><div><p className="eyebrow">Views</p><h2>Open or create a dashboard</h2></div></div>
        <div className="project-workspace-tabs">{views.map((view) => <Link className={selected?.id === view.id ? "active" : ""} href={`/projects/${projectId}/dashboards?viewId=${view.id}`} key={view.id}>{view.name}{view.is_default ? " ★" : ""}{view.owner_user_id !== user.id ? " · Shared" : ""}</Link>)}</div>
        <form action={createDashboardViewAction} className="inline-create"><input type="hidden" name="projectId" value={projectId}/><input name="name" placeholder="Opening Week" required/><select name="visibility" defaultValue="private"><option value="private">Private</option><option value="project">Share with project</option></select><button type="submit">Create dashboard</button></form>
      </section>

      {selected ? <>
        <div className="section-heading"><div><p className="eyebrow">Active Dashboard</p><h2>{selected.name}</h2></div>{ownsSelected ? <div className="top-actions"><Link className="button secondary" href={`/projects/${projectId}/dashboards?viewId=${selected.id}&edit=${query?.edit === "true" ? "false" : "true"}`}>{query?.edit === "true" ? "Close builder" : "Customize"}</Link>{!selected.is_default ? <form action={setDefaultDashboardAction}><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="viewId" value={selected.id}/><button type="submit">Make default</button></form> : null}</div> : null}</div>
        <div className="dashboard-grid">{layout.map(renderModule)}</div>
        {ownsSelected && query?.edit === "true" && saveAction ? <section className="panel workspace-section"><p className="eyebrow">Dashboard Builder</p><h2>Modules and layout</h2><DashboardViewEditor layout={layout} saveAction={saveAction}/><hr/><form action={updateDashboardDetailsAction} className="inline-create"><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="viewId" value={selected.id}/><input name="name" defaultValue={selected.name} required/><select name="visibility" defaultValue={selected.visibility}><option value="private">Private</option><option value="project">Share with project</option></select><button type="submit">Save view settings</button></form><form action={deleteDashboardViewAction} style={{ marginTop: 16 }}><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="viewId" value={selected.id}/><button className="button danger" type="submit">Delete dashboard</button></form></section> : null}
      </> : <section className="panel"><p className="muted">Create your first dashboard to choose and arrange modules.</p></section>}
    </div>
  );
}
