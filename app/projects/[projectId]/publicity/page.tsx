import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  approveAndSyncPublicityAction,
  prepareProjectPublicityAction,
  refreshPublicityFromProfileAction,
  requestPublicityApprovalAction,
  retryPublicitySyncAction,
  saveProjectPublicityCopyAction
} from "@/app/projects/[projectId]/publicity/actions";

export const dynamic = "force-dynamic";

type Assignment = {
  id: string;
  person_id: string;
  people: { full_name: string; email: string; auth_user_id: string | null; publicity_profile_version: number } | null;
  project_roles: { name: string; role_group: string } | null;
};

type Publicity = {
  id: string;
  person_id: string;
  credited_name: string;
  bio: string;
  headshot_url: string;
  source_profile_version: number;
  status: string;
  person_approved_at: string | null;
  editorial_approved_at: string | null;
  playbill_sync_status: string;
  playbill_sync_error: string;
  playbill_synced_at: string | null;
};

function label(value: string) {
  return value.split("_").map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join(" ");
}

export default async function ProjectPublicityPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams?: Promise<{ error?: string; success?: string }> }) {
  await requireUser();
  const { projectId } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [{ data: project }, { data: assignments }, { data: submissions }, { data: playbillLink }] = await Promise.all([
    supabase.from("projects").select("id, title").eq("id", projectId).maybeSingle(),
    supabase.from("role_assignments").select("id, person_id, status, people(full_name, email, auth_user_id, publicity_profile_version), project_roles(name, role_group)").eq("project_id", projectId).not("status", "in", "(declined,withdrawn)").order("created_at"),
    supabase.from("project_publicity_submissions").select("id, person_id, credited_name, bio, headshot_url, source_profile_version, status, person_approved_at, editorial_approved_at, playbill_sync_status, playbill_sync_error, playbill_synced_at").eq("project_id", projectId),
    supabase.from("external_links").select("id").eq("local_entity_type", "project").eq("local_entity_id", projectId).eq("external_app", "playbill").eq("external_table", "shows").maybeSingle()
  ]);
  if (!project) notFound();

  const assignmentRows = (assignments ?? []) as unknown as Assignment[];
  const submissionByPerson = new Map(((submissions ?? []) as Publicity[]).map((item) => [item.person_id, item]));
  const rolesByPerson = new Map<string, string[]>();
  for (const assignment of assignmentRows) {
    const roles = rolesByPerson.get(assignment.person_id) ?? [];
    if (assignment.project_roles?.name && !roles.includes(assignment.project_roles.name)) roles.push(assignment.project_roles.name);
    rolesByPerson.set(assignment.person_id, roles);
  }
  const prepared = submissionByPerson.size;
  const awaiting = ((submissions ?? []) as Publicity[]).filter((item) => item.status === "awaiting_person_approval").length;
  const approved = ((submissions ?? []) as Publicity[]).filter((item) => item.status === "approved").length;

  return (
    <div className="page workspace-page">
      <div className="page-header">
        <div><p className="eyebrow">Publicity Workflow</p><h1>{project.title}</h1><p className="muted">Reusable profiles feed frozen production copies. Only person-approved and editorially approved copy is sent to Playbill.</p></div>
        <div className="top-actions"><Link className="button secondary" href={`/projects/${projectId}`}>Project</Link><Link className="button secondary" href="/my-profile">My Profile</Link></div>
      </div>
      {query?.error ? <p className="setup-warning">{query.error}</p> : null}
      {query?.success ? <p className="setup-success">{query.success}</p> : null}

      <section className="workspace-summary" aria-label="Publicity summary">
        <div><span>{assignmentRows.length}</span><p>Assignments</p></div>
        <div><span>{prepared}</span><p>Prepared</p></div>
        <div><span>{awaiting}</span><p>Awaiting Person</p></div>
        <div><span>{approved}</span><p>Editorially Approved</p></div>
      </section>

      <section className="panel workspace-section">
        <div className="section-heading"><div><p className="eyebrow">Setup</p><h2>Production copies</h2><p className="muted">Preparing is safe to run again: existing edited or approved copies are never overwritten.</p></div>
          <form action={prepareProjectPublicityAction}><input type="hidden" name="projectId" value={projectId} /><button type="submit">Prepare missing copies</button></form>
        </div>
        {!playbillLink ? <p className="setup-warning">This project is not linked to a Playbill show. You can prepare and approve copy now, then sync after linking.</p> : null}
      </section>

      <div className="compact-list">
        {[...new Map(assignmentRows.map((assignment) => [assignment.person_id, assignment])).values()].map((assignment) => {
          const item = submissionByPerson.get(assignment.person_id);
          if (!item) return (
            <section className="panel" key={assignment.person_id}><strong>{assignment.people?.full_name ?? "Unknown person"}</strong><p className="muted">{rolesByPerson.get(assignment.person_id)?.join(", ") || "Role"} · Not prepared</p></section>
          );
          const profileChanged = Number(assignment.people?.publicity_profile_version ?? 1) > item.source_profile_version;
          return (
            <section className="panel workspace-section" key={assignment.id}>
              <div className="section-heading">
                <div><p className="eyebrow">Production Publicity</p><h2>{assignment.people?.full_name ?? "Unknown person"}</h2><p className="muted">{rolesByPerson.get(assignment.person_id)?.join(", ") || "Role"} · Status: {label(item.status)} · Playbill: {label(item.playbill_sync_status)}{assignment.people?.auth_user_id ? " · Profile connected" : " · Profile not yet connected"}</p></div>
                <div className="top-actions">{profileChanged ? <span className="status-badge gold">New profile version available</span> : null}<span className="status-badge">Snapshot v{item.source_profile_version}</span></div>
              </div>
              {item.playbill_sync_error ? <p className="setup-warning">{item.playbill_sync_error}</p> : null}
              <form action={saveProjectPublicityCopyAction} className="stacked-form">
                <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="submissionId" value={item.id} />
                <label className="field"><span>Credited name</span><input name="creditedName" defaultValue={item.credited_name} required /></label>
                <label className="field"><span>Production bio</span><textarea name="bio" defaultValue={item.bio} rows={8} /></label>
                <label className="field"><span>Production headshot URL</span><input name="headshotUrl" type="url" defaultValue={item.headshot_url} placeholder="https://…" /></label>
                <button type="submit">Save production copy</button>
              </form>
              <div className="top-actions" style={{ marginTop: 12 }}>
                <form action={refreshPublicityFromProfileAction}><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="submissionId" value={item.id} /><button className="button secondary" type="submit">Refresh from profile</button></form>
                {['draft', 'changes_requested'].includes(item.status) ? <form action={requestPublicityApprovalAction}><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="submissionId" value={item.id} /><button type="submit">Request person approval</button></form> : null}
                {item.status === "person_approved" ? <form action={approveAndSyncPublicityAction}><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="submissionId" value={item.id} /><button type="submit">Editorial approve &amp; send to Playbill</button></form> : null}
                {item.status === "approved" && item.playbill_sync_status !== "synced" ? <form action={retryPublicitySyncAction}><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="submissionId" value={item.id} /><button type="submit">Retry Playbill sync</button></form> : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
