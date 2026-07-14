import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ProjectWorkspaceNav } from "@/components/project-workspace-nav";
import { ProjectContextSwitcher } from "@/components/project-context-switcher";
import { PublicityBioField, PublicityBioPreview } from "@/components/publicity-bio-field";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { InlineHelp } from "@/components/ui/inline-help";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  prepareProjectPublicityAction,
  refreshPublicityFromProfileAction,
  requestPublicityApprovalAction,
  retryPublicitySyncAction,
  savePublicitySettingsAction,
  sendBulkPublicityRemindersAction,
  sendPublicityReminderAction,
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
  playbill_submission_status: string;
  playbill_locked_at: string | null;
  last_reminder_sent_at: string | null;
  reminder_count: number;
};
type PublicitySettings = { bio_due_on: string | null; headshot_due_on: string | null; reminders_enabled: boolean; bio_character_limit: number };

function label(value: string) {
  return value.split("_").map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join(" ");
}

export default async function ProjectPublicityPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams?: Promise<{ error?: string; success?: string }> }) {
  await requireUser();
  const { projectId } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [{ data: project }, { data: assignments }, { data: submissions }, { data: playbillLink }, { data: settings }] = await Promise.all([
    supabase.from("projects").select("id, title").eq("id", projectId).maybeSingle(),
    supabase.from("role_assignments").select("id, person_id, status, people(full_name, email, auth_user_id, publicity_profile_version), project_roles(name, role_group)").eq("project_id", projectId).not("status", "in", "(declined,withdrawn)").order("created_at"),
    supabase.from("project_publicity_submissions").select("id, person_id, credited_name, bio, headshot_url, source_profile_version, status, person_approved_at, editorial_approved_at, playbill_sync_status, playbill_sync_error, playbill_synced_at, playbill_submission_status, playbill_locked_at, last_reminder_sent_at, reminder_count").eq("project_id", projectId),
    supabase.from("external_links").select("id").eq("local_entity_type", "project").eq("local_entity_id", projectId).eq("external_app", "playbill").eq("external_table", "shows").maybeSingle(),
    supabase.from("project_publicity_settings").select("bio_due_on, headshot_due_on, reminders_enabled, bio_character_limit").eq("project_id", projectId).maybeSingle()
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
  const publicityRows = (submissions ?? []) as Publicity[];
  const outstanding = publicityRows.filter((item) => item.playbill_submission_status !== "locked" && (!item.bio.trim() || !item.headshot_url.trim() || !["person_approved", "approved"].includes(item.status)));
  const submitted = publicityRows.filter((item) => item.playbill_submission_status === "submitted").length;
  const approved = publicityRows.filter((item) => item.playbill_submission_status === "approved").length;
  const locked = publicityRows.filter((item) => item.playbill_submission_status === "locked").length;
  const publicitySettings = settings as PublicitySettings | null;

  return (
    <div className="page workspace-page">
      <div className="page-header">
        <div><p className="eyebrow">Publicity Dashboard</p><h1>{project.title}</h1><p className="muted">Production Management collects and person-approves copy. Playbill handles final editorial approval and locking.</p></div>
        <div className="top-actions"><ProjectContextSwitcher projectId={projectId} workspace="publicity"/><Link className="button secondary" href={`/projects/${projectId}/overview`}>Project</Link><Link className="button secondary" href="/my-profile">My Profile</Link></div>
      </div>
      <ProjectWorkspaceNav projectId={projectId} active="publicity" />
      <FeedbackBanner error={query?.error} success={query?.success} />
      <InlineHelp title="How profiles, approvals, and Playbill stay in sync"><p>A person’s profile holds their reusable headshot and overall bio. Each production receives its own editable copy, so someone working on several shows can approve a different bio for each one.</p><p>Person approval automatically sends eligible copy to a linked Playbill show as <strong>Submitted</strong>. Final editorial approval and locking happen in Playbill. A locked copy remains visible here for history and is no longer overwritten.</p></InlineHelp>

      <section className="workspace-summary" aria-label="Publicity summary">
        <div><span>{outstanding.length}</span><p>Outstanding</p></div>
        <div><span>{submitted}</span><p>Submitted</p></div>
        <div><span>{approved}</span><p>Playbill Approved</p></div>
        <div><span>{locked}</span><p>Final &amp; Locked</p></div>
      </section>
      <div className="top-actions" aria-label="Playbill status breakdown" style={{ marginBottom: 20 }}>
        {["pending", "draft", "submitted", "returned", "approved", "locked"].map((status) => (
          <StatusBadge status={status} context="playbill" label={`${label(status)}: ${publicityRows.filter((item) => item.playbill_submission_status === status).length}`} key={status} />
        ))}
      </div>

      <section className="panel workspace-section">
        <div className="section-heading"><div><p className="eyebrow">Setup</p><h2>Production copies</h2><p className="muted">Preparing is safe to run again: existing edited or approved copies are never overwritten.</p></div>
          <form action={prepareProjectPublicityAction}><input type="hidden" name="projectId" value={projectId} /><button type="submit">Prepare missing copies</button></form>
        </div>
        {!playbillLink ? <p className="setup-warning">This project is not linked to a Playbill show. You can prepare and approve copy now, then sync after linking.</p> : null}
      </section>

      <section className="panel workspace-section">
        <div className="section-heading"><div><p className="eyebrow">Deadlines</p><h2>Bio and headshot due dates</h2><p className="muted">These dates appear in each person’s secure profile and in branded reminders.</p></div></div>
        <form action={savePublicitySettingsAction} className="stacked-form">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="form-row"><label className="field"><span>Bio due</span><input type="date" name="bioDueOn" defaultValue={publicitySettings?.bio_due_on ?? ""} /></label><label className="field"><span>Headshot due</span><input type="date" name="headshotDueOn" defaultValue={publicitySettings?.headshot_due_on ?? ""} /></label></div>
          <label className="field"><span>Show-specific bio character limit</span><input type="number" name="bioCharacterLimit" min={50} max={5000} step={1} defaultValue={publicitySettings?.bio_character_limit ?? 350} required /><small>Counts visible text only; formatting does not use the character allowance.</small></label>
          <label className="check-row"><input type="checkbox" name="remindersEnabled" defaultChecked={publicitySettings?.reminders_enabled ?? true} /><span>Allow publicity reminder emails</span></label>
          <button type="submit">Save publicity settings</button>
        </form>
      </section>

      <section className="panel workspace-section">
        <div className="section-heading"><div><p className="eyebrow">Bulk Reminders</p><h2>Send secure profile links</h2><p className="muted">Only people with missing copy, a missing headshot, or outstanding approval are listed.</p></div></div>
        {outstanding.length ? <form action={sendBulkPublicityRemindersAction} className="stacked-form">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="compact-list">{outstanding.map((item) => {
            const assignment = assignmentRows.find((row) => row.person_id === item.person_id);
            return <label className="check-row" key={item.id}><input type="checkbox" name="personId" value={item.person_id} defaultChecked /><span><strong>{assignment?.people?.full_name ?? "Unknown person"}</strong> · {!item.bio.trim() ? "Bio missing · " : ""}{!item.headshot_url.trim() ? "Headshot missing · " : ""}{label(item.status)}</span></label>;
          })}</div>
          <button type="submit">Send selected reminders</button>
        </form> : <EmptyState title="Everyone is current">No publicity reminders are needed right now.</EmptyState>}
      </section>

      <div className="compact-list">
        {[...new Map(assignmentRows.map((assignment) => [assignment.person_id, assignment])).values()].map((assignment) => {
          const item = submissionByPerson.get(assignment.person_id);
          if (!item) return (
            <section className="panel" key={assignment.person_id}><strong>{assignment.people?.full_name ?? "Unknown person"}</strong><p className="muted">{rolesByPerson.get(assignment.person_id)?.join(", ") || "Role"} · Not prepared</p></section>
          );
          const profileChanged = Number(assignment.people?.publicity_profile_version ?? 1) > item.source_profile_version;
          const isLocked = item.playbill_submission_status === "locked";
          const previewRole = rolesByPerson.get(assignment.person_id)?.join(", ") || "Production role";
          return (
            <section className="panel workspace-section" key={assignment.id}>
              <div className="section-heading">
                <div><p className="eyebrow">Production Publicity</p><h2>{assignment.people?.full_name ?? "Unknown person"}</h2><p className="muted">{rolesByPerson.get(assignment.person_id)?.join(", ") || "Role"} · Person: {label(item.status)} · Playbill: {label(item.playbill_submission_status)}{assignment.people?.auth_user_id ? " · Profile connected" : " · Profile not yet connected"}</p></div>
                <div className="top-actions">{profileChanged && !isLocked ? <StatusBadge status="pending" label="New profile version available" /> : null}<StatusBadge status={isLocked ? "locked" : "draft"} context="playbill" label={isLocked ? "Final & locked" : `Snapshot v${item.source_profile_version}`} /></div>
              </div>
              {item.playbill_sync_error ? <p className="setup-warning">{item.playbill_sync_error}</p> : null}
              {!isLocked ? <form action={saveProjectPublicityCopyAction} className="stacked-form">
                <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="submissionId" value={item.id} />
                <label className="field"><span>Credited name</span><input name="creditedName" defaultValue={item.credited_name} required /></label>
                <PublicityBioField name="bio" label="Production bio" initialValue={item.bio} previewName={item.credited_name} previewRole={previewRole} characterLimit={publicitySettings?.bio_character_limit ?? 350} compact />
                <label className="field"><span>Production headshot URL</span><input name="headshotUrl" type="url" defaultValue={item.headshot_url} placeholder="https://…" /></label>
                <button type="submit">Save production copy</button>
              </form> : <PublicityBioPreview bio={item.bio} name={item.credited_name} role={previewRole} />}
              <div className="top-actions" style={{ marginTop: 12 }}>
                {!isLocked ? <form action={refreshPublicityFromProfileAction}><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="submissionId" value={item.id} /><button className="button secondary" type="submit">Refresh from profile</button></form> : null}
                {!isLocked && ['draft', 'changes_requested'].includes(item.status) ? <form action={requestPublicityApprovalAction}><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="submissionId" value={item.id} /><button type="submit">Request person approval</button></form> : null}
                {!isLocked && ["person_approved", "approved"].includes(item.status) && item.playbill_sync_status !== "synced" ? <form action={retryPublicitySyncAction}><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="submissionId" value={item.id} /><button type="submit">Retry Playbill submission</button></form> : null}
                {!isLocked && outstanding.some((row) => row.id === item.id) ? <form action={sendPublicityReminderAction}><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="personId" value={item.person_id} /><button className="button secondary" type="submit">Send reminder</button></form> : null}
              </div>
              {item.last_reminder_sent_at ? <p className="muted">{item.reminder_count} reminder{item.reminder_count === 1 ? "" : "s"} sent · Last {new Date(item.last_reminder_sent_at).toLocaleString("en-US")}</p> : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
