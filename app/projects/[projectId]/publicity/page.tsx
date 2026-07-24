import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { firstAndLastName } from "@/lib/person-display-name";
import { ProjectWorkspaceNav } from "@/components/project-workspace-nav";
import { ProjectContextSwitcher } from "@/components/project-context-switcher";
import { PublicityDirectory, type PublicityDirectoryPerson } from "@/components/publicity-directory";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { InlineHelp } from "@/components/ui/inline-help";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  prepareProjectPublicityAction,
  savePublicitySettingsAction
} from "@/app/projects/[projectId]/publicity/actions";

export const dynamic = "force-dynamic";

type Assignment = {
  id: string;
  person_id: string;
  people: { full_name: string; first_name: string; last_name: string; email: string; auth_user_id: string | null; publicity_profile_version: number } | null;
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
  bio_required: boolean;
};
type PublicitySettings = {
  bio_due_on: string | null;
  headshot_due_on: string | null;
  reminders_enabled: boolean;
  reminder_automation_enabled: boolean;
  reminder_cadence_days: number;
  reminder_due_soon_days: number;
  reminder_send_last_day: boolean;
  last_automatic_reminder_run_at: string | null;
  bio_character_limit: number;
};

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
    supabase.from("role_assignments").select("id, person_id, status, people(full_name, first_name, last_name, email, auth_user_id, publicity_profile_version), project_roles(name, role_group)").eq("project_id", projectId).not("status", "in", "(declined,withdrawn)").order("created_at"),
    supabase.from("project_publicity_submissions").select("id, person_id, credited_name, bio, headshot_url, source_profile_version, status, person_approved_at, editorial_approved_at, playbill_sync_status, playbill_sync_error, playbill_synced_at, playbill_submission_status, playbill_locked_at, last_reminder_sent_at, reminder_count, bio_required").eq("project_id", projectId),
    supabase.from("external_links").select("id").eq("local_entity_type", "project").eq("local_entity_id", projectId).eq("external_app", "playbill").eq("external_table", "shows").maybeSingle(),
    supabase.from("project_publicity_settings").select("bio_due_on, headshot_due_on, reminders_enabled, reminder_automation_enabled, reminder_cadence_days, reminder_due_soon_days, reminder_send_last_day, last_automatic_reminder_run_at, bio_character_limit").eq("project_id", projectId).maybeSingle()
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
  const requiredPublicityRows = publicityRows.filter((item) => item.bio_required !== false);
  const exempt = publicityRows.length - requiredPublicityRows.length;
  const outstanding = requiredPublicityRows.filter((item) => item.playbill_submission_status !== "locked" && (!item.bio.trim() || !item.headshot_url.trim() || !["person_approved", "approved"].includes(item.status)));
  const submitted = requiredPublicityRows.filter((item) => item.playbill_submission_status === "submitted").length;
  const approved = requiredPublicityRows.filter((item) => item.playbill_submission_status === "approved").length;
  const locked = requiredPublicityRows.filter((item) => item.playbill_submission_status === "locked").length;
  const publicitySettings = settings as PublicitySettings | null;
  const people = [...new Map(assignmentRows.map((assignment) => [assignment.person_id, assignment])).values()]
    .map((assignment): PublicityDirectoryPerson => {
      const item = submissionByPerson.get(assignment.person_id);
      return {
        personId: assignment.person_id,
        submissionId: item?.id ?? null,
        name: firstAndLastName(assignment.people ?? {}) || "Unknown person",
        email: assignment.people?.email ?? "",
        roles: rolesByPerson.get(assignment.person_id) ?? [],
        profileConnected: Boolean(assignment.people?.auth_user_id),
        profileChanged: Boolean(item && Number(assignment.people?.publicity_profile_version ?? 1) > item.source_profile_version),
        creditedName: item?.credited_name ?? firstAndLastName(assignment.people ?? {}),
        bio: item?.bio ?? "",
        headshotUrl: item?.headshot_url ?? "",
        status: item?.status ?? "not_prepared",
        playbillStatus: item?.playbill_submission_status ?? "pending",
        playbillSyncStatus: item?.playbill_sync_status ?? "not_ready",
        playbillSyncError: item?.playbill_sync_error ?? "",
        lastReminderSentAt: item?.last_reminder_sent_at ?? null,
        reminderCount: item?.reminder_count ?? 0,
        bioRequired: item?.bio_required ?? true
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="page workspace-page">
      <div className="page-header">
        <div><p className="eyebrow">Publicity Dashboard</p><h1>{project.title}</h1><p className="muted">Production Management collects and person-approves copy. Playbill handles final editorial approval and locking.</p></div>
        <div className="top-actions"><ProjectContextSwitcher projectId={projectId} workspace="publicity"/><Link className="button secondary" href={`/projects/${projectId}/overview`}>Project</Link><Link className="button secondary" href="/my-profile">My Profile</Link></div>
      </div>
      <ProjectWorkspaceNav projectId={projectId} active="publicity" />
      <FeedbackBanner error={query?.error} success={query?.success} />
      <InlineHelp title="How profiles, approvals, reminders, and Playbill stay in sync"><p>A person’s profile holds their reusable headshot and overall bio. Each production receives its own editable copy, so someone working on several shows can approve a different bio for each one.</p><p>Person approval automatically sends eligible copy to a linked Playbill show as <strong>Submitted</strong>. Final editorial approval and locking happen in Playbill. A locked copy remains visible here for history and is no longer overwritten.</p><p>When automatic reminders are enabled, Production Management checks once each morning and follows the same cadence rules as Playbill. Each message names every outstanding item and gives the person a secure path to edit, approve and submit, or mark their production bio as not needed. Manual reminders remain available from the status list.</p></InlineHelp>

      <section className="workspace-summary" aria-label="Publicity summary">
        <div><span>{outstanding.length}</span><p>Outstanding</p></div>
        <div><span>{submitted}</span><p>Submitted</p></div>
        <div><span>{approved}</span><p>Playbill Approved</p></div>
        <div><span>{locked}</span><p>Final &amp; Locked</p></div>
      </section>
      <div className="top-actions" aria-label="Playbill status breakdown" style={{ marginBottom: 20 }}>
        {["pending", "draft", "submitted", "returned", "approved", "locked"].map((status) => (
          <StatusBadge status={status} context="playbill" label={`${label(status)}: ${requiredPublicityRows.filter((item) => item.playbill_submission_status === status).length}`} key={status} />
        ))}
        {exempt ? <StatusBadge status="not_required" label={`Bio not required: ${exempt}`} /> : null}
      </div>

      <details className="panel workspace-section publicity-settings">
        <summary><span><strong>Publicity settings</strong><small>Deadlines, reminders, character limit, Playbill link, and repair tools</small></span></summary>
        {!playbillLink ? <p className="setup-warning">This project is not linked to a Playbill show. You can prepare and approve copy now, then sync after linking.</p> : null}
        <form action={savePublicitySettingsAction} className="stacked-form">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="form-row"><label className="field"><span>Bio due</span><input type="date" name="bioDueOn" defaultValue={publicitySettings?.bio_due_on ?? ""} /></label><label className="field"><span>Headshot due</span><input type="date" name="headshotDueOn" defaultValue={publicitySettings?.headshot_due_on ?? ""} /></label></div>
          <label className="field"><span>Show-specific bio character limit</span><input type="number" name="bioCharacterLimit" min={50} max={5000} step={1} defaultValue={publicitySettings?.bio_character_limit ?? 350} required /><small>Counts visible text only; formatting does not use the character allowance.</small></label>
          <label className="check-row"><input type="checkbox" name="remindersEnabled" defaultChecked={publicitySettings?.reminders_enabled ?? true} /><span>Allow publicity reminder emails for this project</span></label>
          <label className="check-row"><input type="checkbox" name="reminderAutomationEnabled" defaultChecked={publicitySettings?.reminder_automation_enabled ?? true} /><span>Automatically check for and send outstanding publicity reminders each morning</span></label>
          <div className="form-row">
            <label className="field"><span>Reminder cadence</span><input type="number" name="reminderCadenceDays" min={1} max={30} step={1} defaultValue={publicitySettings?.reminder_cadence_days ?? 7} required /><small>Days between reminders before the due date. Playbill’s default is 7.</small></label>
            <label className="field"><span>Due-soon reporting window</span><input type="number" name="reminderDueSoonDays" min={1} max={30} step={1} defaultValue={publicitySettings?.reminder_due_soon_days ?? 7} required /><small>How many days ahead the dashboard treats an item as due soon.</small></label>
          </div>
          <label className="check-row"><input type="checkbox" name="reminderSendLastDay" defaultChecked={publicitySettings?.reminder_send_last_day ?? true} /><span>Send on the due date and continue daily afterward until completed, locked, or skipped</span></label>
          <p className="muted">The scheduler runs daily at the same time as Playbill’s reminder job. Completed, Playbill-locked, and “No bio needed” records are excluded automatically.{publicitySettings?.last_automatic_reminder_run_at ? ` Last checked ${new Date(publicitySettings.last_automatic_reminder_run_at).toLocaleString("en-US", { timeZone: "America/New_York" })}.` : ""}</p>
          <div className="top-actions"><button type="submit">Save publicity settings</button></div>
        </form>
        <hr/>
        <div className="section-heading"><div><strong>Automatic production copies</strong><p className="muted">Copies are created on assignment. This repair action only fills missing records and never overwrites existing edits.</p></div><form action={prepareProjectPublicityAction}><input type="hidden" name="projectId" value={projectId}/><button type="submit" className="button secondary">Repair any missing copies</button></form></div>
      </details>

      <PublicityDirectory projectId={projectId} people={people} characterLimit={publicitySettings?.bio_character_limit ?? 350} remindersEnabled={publicitySettings?.reminders_enabled ?? true}/>
    </div>
  );
}
