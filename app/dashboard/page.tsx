import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { loadOperationsDashboard, type OperationsProject } from "@/lib/operations-dashboard";
import { filterOperationItems, operationCategories, operationDueWindows, type OperationCategory, type OperationDueWindow, type OperationItem } from "@/lib/operations-dashboard-model";

export const dynamic = "force-dynamic";

function category(value: string | undefined): "all" | OperationCategory {
  return operationCategories.includes(value as (typeof operationCategories)[number]) ? value as "all" | OperationCategory : "all";
}

function dueWindow(value: string | undefined): OperationDueWindow {
  return operationDueWindows.includes(value as OperationDueWindow) ? value as OperationDueWindow : "all";
}

function label(value: string) {
  return value.split("_").map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join(" ");
}

function formatDate(value: string | null) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date(value));
}

function OperationRow({ item }: { item: OperationItem }) {
  return (
    <article className={`operation-row operation-${item.severity}`}>
      <div className="operation-copy">
        <div className="operation-meta"><span className="status-badge">{label(item.category)}</span><span>{item.projectTitle}</span>{item.dueAt ? <span>{formatDate(item.dueAt)}</span> : null}</div>
        <strong>{item.title}</strong>
        <p>{item.detail}</p>
      </div>
      <Link className="button secondary" href={item.href}>Open</Link>
    </article>
  );
}

export default async function OperationsDashboardPage({ searchParams }: { searchParams?: Promise<{ project?: string; category?: string; due?: string }> }) {
  await requireUser();
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [{ data: role }, { data: projectData, error: projectError }] = await Promise.all([
    supabase.rpc("get_user_role"),
    supabase.from("projects").select("id, title, status, starts_on, ends_on").in("status", ["planning", "active", "paused"]).order("starts_on", { ascending: true, nullsFirst: false }).order("title")
  ]);
  if (!role || role === "none") redirect("/my-profile");

  const projects = (projectData ?? []) as OperationsProject[];
  const validProjectId = projects.some((project) => project.id === query?.project) ? String(query?.project) : "";
  const filters = { projectId: validProjectId, category: category(query?.category), due: dueWindow(query?.due) };
  const now = new Date();
  const { items, warnings } = await loadOperationsDashboard(projects, now);
  const visible = filterOperationItems(items, filters, now);
  const attention = visible.filter((item) => item.kind === "attention");
  const upcoming = visible.filter((item) => item.kind === "upcoming");
  const allAttention = items.filter((item) => item.kind === "attention");
  const urgent = allAttention.filter((item) => item.severity === "urgent").length;
  const overdue = items.filter((item) => item.dueAt && new Date(item.dueAt).getTime() < now.getTime()).length;
  const nextWeek = items.filter((item) => item.kind === "upcoming" && item.dueAt && new Date(item.dueAt).getTime() <= now.getTime() + 7 * 86400000).length;
  const dataWarnings = [...new Set([projectError?.message, ...warnings].filter((message): message is string => Boolean(message)))];

  return (
    <div className="page workspace-page">
      <div className="page-header">
        <div><p className="eyebrow">Production Operations</p><h1>What needs attention</h1><p className="muted">One view across active productions for publicity, integrations, communications, auditions, and deadlines.</p></div>
        <div className="top-actions"><Link className="button secondary" href="/projects">Project directory</Link></div>
      </div>
      {dataWarnings.length ? <section className="setup-warning"><strong>Some dashboard data could not be loaded.</strong><ul>{dataWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></section> : null}
      <section className="workspace-summary operations-summary" aria-label="Operations summary">
        <div><span>{projects.length}</span><p>Active Projects</p></div><div><span>{allAttention.length}</span><p>Needs Attention</p></div><div><span>{urgent}</span><p>Urgent</p></div><div><span>{overdue}</span><p>Overdue</p></div><div><span>{nextWeek}</span><p>Next 7 Days</p></div>
      </section>
      <section className="panel operations-filter-panel">
        <div><p className="eyebrow">Filters</p><h2>Focus the dashboard</h2></div>
        <form className="operations-filter" method="get">
          <label className="field"><span>Project</span><select name="project" defaultValue={filters.projectId}><option value="">All active projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
          <label className="field"><span>Area</span><select name="category" defaultValue={filters.category}>{operationCategories.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
          <label className="field"><span>Due</span><select name="due" defaultValue={filters.due}><option value="all">Any date</option><option value="overdue">Overdue</option><option value="7">Within 7 days</option><option value="30">Within 30 days</option></select></label>
          <div className="form-actions"><button type="submit">Apply filters</button><Link className="button secondary" href="/dashboard">Clear</Link></div>
        </form>
      </section>
      <div className="operations-grid">
        <section className="panel"><div className="section-heading"><div><p className="eyebrow">Action Queue</p><h2>Needs attention</h2><p className="muted">{attention.length} matching item{attention.length === 1 ? "" : "s"}</p></div></div><div className="operation-list">{attention.length ? attention.slice(0, 100).map((item) => <OperationRow item={item} key={item.id} />) : <p className="empty-state">Nothing in this view needs attention.</p>}</div>{attention.length > 100 ? <p className="muted">Showing the first 100 items. Narrow the filters to see more.</p> : null}</section>
        <section className="panel"><div className="section-heading"><div><p className="eyebrow">Coming Up</p><h2>Deadlines and auditions</h2><p className="muted">{upcoming.length} matching item{upcoming.length === 1 ? "" : "s"}</p></div></div><div className="operation-list">{upcoming.length ? upcoming.slice(0, 60).map((item) => <OperationRow item={item} key={item.id} />) : <p className="empty-state">No upcoming deadlines in this view.</p>}</div></section>
      </div>
    </div>
  );
}
