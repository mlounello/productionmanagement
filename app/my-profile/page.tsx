import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ProfileHeadshotUploader } from "@/components/profile-headshot-uploader";
import { PublicityBioField, PublicityBioPreview } from "@/components/publicity-bio-field";
import {
  approveMyPublicitySubmissionAction,
  connectMyProfileAction,
  requestMyEmailChangeAction,
  updateMyProjectPublicityBioAction,
  updateMyPublicityProfileAction
} from "@/app/my-profile/actions";

export const dynamic = "force-dynamic";

type Profile = {
  id: string; full_name: string; first_name: string; middle_name: string; last_name: string;
  preferred_name: string; email: string; vendor_number: string; phone: string; pronouns: string;
  publicity_bio: string; publicity_headshot_url: string; publicity_profile_version: number;
};
type Submission = { id: string; project_id: string; credited_name: string; bio: string; headshot_url: string; status: string; playbill_submission_status: string; playbill_locked_at: string | null; source_profile_version: number; projects: { title: string } | null };
type PublicitySettings = { project_id: string; bio_due_on: string | null; headshot_due_on: string | null };
type Assignment = { id: string; status: string; is_guest_artist: boolean; projects: { id: string; title: string; starts_on: string | null; ends_on: string | null } | null; project_roles: { name: string; role_group: string; department: string } | null };
type Accomplishment = { id: string; title: string; accomplishment_type: string; issuer: string; awarded_on: string | null; description: string; projects: { title: string } | null };
type VisibleNote = { id: string; note: string; created_at: string; projects: { title: string } | null };

function titleCase(value: string) { return value.split("_").map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join(" "); }
function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)) : "Date not listed";
}
function formatStatus(value: string) { return value.split("_").map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join(" "); }

export default async function MyProfilePage({ searchParams }: { searchParams?: Promise<{ error?: string; success?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("people")
    .select("id, full_name, first_name, middle_name, last_name, preferred_name, email, vendor_number, phone, pronouns, publicity_bio, publicity_headshot_url, publicity_profile_version")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile) return (
    <div className="page workspace-page"><section className="panel" style={{ maxWidth: 680 }}>
      <p className="eyebrow">My Profile</p><h1>Connect your profile</h1>
      <p className="muted">We will securely match your verified sign-in email to the person already on file. If no record exists, one will be created.</p>
      {query?.error ? <p className="setup-warning">{query.error}</p> : null}
      <form action={connectMyProfileAction}><button type="submit">Connect my profile</button></form>
    </section></div>
  );

  const typedProfile = profile as Profile;
  const [{ data: submissions }, { data: assignments }, { data: accomplishments }, { data: notes }, { data: publicitySettings }] = await Promise.all([
    supabase.from("project_publicity_submissions").select("id, project_id, credited_name, bio, headshot_url, status, playbill_submission_status, playbill_locked_at, source_profile_version, projects(title)").eq("person_id", typedProfile.id).order("updated_at", { ascending: false }),
    supabase.from("role_assignments").select("id, status, is_guest_artist, projects(id, title, starts_on, ends_on), project_roles(name, role_group, department)").eq("person_id", typedProfile.id).order("created_at", { ascending: false }),
    supabase.from("profile_accomplishments").select("id, title, accomplishment_type, issuer, awarded_on, description, projects(title)").eq("person_id", typedProfile.id).order("awarded_on", { ascending: false }),
    supabase.from("person_notes").select("id, note, created_at, projects(title)").eq("person_id", typedProfile.id).eq("visibility", "client_visible").order("created_at", { ascending: false }),
    supabase.from("project_publicity_settings").select("project_id, bio_due_on, headshot_due_on")
  ]);
  const submissionRows = (submissions ?? []) as unknown as Submission[];
  const assignmentRows = (assignments ?? []) as unknown as Assignment[];
  const accomplishmentRows = (accomplishments ?? []) as unknown as Accomplishment[];
  const noteRows = (notes ?? []) as unknown as VisibleNote[];
  const settingsByProject = new Map(((publicitySettings ?? []) as PublicitySettings[]).map((item) => [item.project_id, item]));
  const rolesByProject = new Map<string, string[]>();
  for (const assignment of assignmentRows) {
    const projectId = assignment.projects?.id;
    const role = assignment.project_roles?.name;
    if (!projectId || !role) continue;
    const roles = rolesByProject.get(projectId) ?? [];
    if (!roles.includes(role)) roles.push(role);
    rolesByProject.set(projectId, roles);
  }

  return (
    <div className="page workspace-page">
      <div className="page-header"><div><p className="eyebrow">My Profile</p><h1>{typedProfile.full_name}</h1><p className="muted">Keep your contact and publicity information current without creating or remembering a password.</p></div></div>
      {query?.error ? <p className="setup-warning">{query.error}</p> : null}
      {query?.success ? <p className="setup-success">{query.success}</p> : null}

      <div className="grid two">
        <section className="panel">
          <p className="eyebrow">Profile Details</p><h2>Your information</h2>
          <form action={updateMyPublicityProfileAction} className="stacked-form">
            <input type="hidden" name="personId" value={typedProfile.id} />
            <label className="field"><span>Full name</span><input name="fullName" defaultValue={typedProfile.full_name} required /></label>
            <div className="form-row">
              <label className="field"><span>First name</span><input name="firstName" defaultValue={typedProfile.first_name} /></label>
              <label className="field"><span>Middle name</span><input name="middleName" defaultValue={typedProfile.middle_name} /></label>
            </div>
            <div className="form-row">
              <label className="field"><span>Last name</span><input name="lastName" defaultValue={typedProfile.last_name} /></label>
              <label className="field"><span>Preferred name</span><input name="preferredName" defaultValue={typedProfile.preferred_name} /></label>
            </div>
            <div className="form-row">
              <label className="field"><span>Pronouns</span><input name="pronouns" defaultValue={typedProfile.pronouns} /></label>
              <label className="field"><span>90#</span><input name="vendorNumber" defaultValue={typedProfile.vendor_number} /></label>
            </div>
            <label className="field"><span>Phone number</span><input name="phone" type="tel" defaultValue={typedProfile.phone} /></label>
            <PublicityBioField name="bio" label="Overall publicity bio" initialValue={typedProfile.publicity_bio} previewName={typedProfile.preferred_name || typedProfile.full_name} previewRole="Role supplied by each production" characterLimit={350} />
            <p className="muted">Profile version {typedProfile.publicity_profile_version}. New productions begin with this reusable 350-character bio; each show then keeps its own editable copy.</p>
            <button type="submit">Save my profile</button>
          </form>

          <hr />
          <form action={requestMyEmailChangeAction} className="stacked-form">
            <label className="field"><span>Email address</span><input name="email" type="email" defaultValue={typedProfile.email} required /></label>
            <p className="muted">For security, a changed address must be verified from the new inbox before it updates here.</p>
            <button type="submit" className="secondary">Verify a new email</button>
          </form>
        </section>

        <section className="panel">
          <p className="eyebrow">Reusable Headshot</p><h2>Crop and upload</h2>
          {typedProfile.publicity_headshot_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={typedProfile.publicity_headshot_url} alt={`${typedProfile.full_name} headshot`} style={{ width: "100%", maxWidth: 360, borderRadius: 12, marginBottom: 16 }} />
          ) : <div className="headshot-placeholder"><span>{typedProfile.full_name.slice(0, 1).toUpperCase()}</span></div>}
          <ProfileHeadshotUploader personId={typedProfile.id} />
        </section>
      </div>

      <section className="panel workspace-section">
        <p className="eyebrow">Role History</p><h2>Your productions and roles</h2>
        <div className="table-list">{assignmentRows.length ? assignmentRows.map((assignment) => (
          <div className="table-row" key={assignment.id}><div><strong>{assignment.project_roles?.name ?? "Role"}</strong><span>{assignment.projects?.title ?? "Production"}{assignment.is_guest_artist ? " · Guest Artist" : ""}</span></div><span>{titleCase(assignment.project_roles?.role_group ?? "role")} · {titleCase(assignment.status)}</span><span>{formatDate(assignment.projects?.starts_on ?? null)}</span></div>
        )) : <p className="muted">No role history is listed yet.</p>}</div>
      </section>

      <div className="grid two workspace-lower">
        <section className="panel"><p className="eyebrow">Accomplishments</p><h2>Recognition on file</h2><div className="compact-list">
          {accomplishmentRows.length ? accomplishmentRows.map((item) => <div className="compact-row" key={item.id}><div><strong>{item.title}</strong><span>{titleCase(item.accomplishment_type)} · {item.issuer || "Issuer not listed"} · {formatDate(item.awarded_on)}</span>{item.description ? <span>{item.description}</span> : null}</div></div>) : <p className="muted">No accomplishments are listed yet.</p>}
        </div></section>
        <section className="panel"><p className="eyebrow">Shared Notes</p><h2>Notes visible to you</h2><div className="compact-list">
          {noteRows.length ? noteRows.map((note) => <div className="compact-row" key={note.id}><div><strong>{note.projects?.title ?? "General profile"}</strong><span>{note.note}</span></div></div>) : <p className="muted">No shared notes are listed.</p>}
        </div><p className="muted">Only notes explicitly marked client-visible appear here. Management-only notes are never sent to this page.</p></section>
      </div>

      <section className="panel workspace-section"><p className="eyebrow">Production Publicity</p><h2>Your show-specific bios</h2><p className="muted">Each production has its own bio. You can edit it until Playbill locks the final program copy.</p><div className="compact-list">
        {submissionRows.length ? submissionRows.map((submission) => {
          const settings = settingsByProject.get(submission.project_id);
          const locked = submission.playbill_submission_status === "locked";
          const previewRole = rolesByProject.get(submission.project_id)?.join(", ") || "Production role";
          return <article className="panel" key={submission.id}>
            <div className="section-heading"><div><strong>{submission.projects?.title ?? "Production"}</strong><p className="muted">Your approval: {formatStatus(submission.status)} · Playbill: {formatStatus(submission.playbill_submission_status)}</p></div><span className={`status-badge${locked ? " gold" : ""}`}>{locked ? "Final & locked" : `v${submission.source_profile_version}`}</span></div>
            <p className="muted">Bio due: {formatDate(settings?.bio_due_on ?? null)} · Headshot due: {formatDate(settings?.headshot_due_on ?? null)}</p>
            <p><strong>Credit:</strong> {submission.credited_name}</p>
            {locked ? <PublicityBioPreview bio={submission.bio} name={submission.credited_name} role={previewRole} /> : <form action={updateMyProjectPublicityBioAction} className="stacked-form">
              <input type="hidden" name="submissionId" value={submission.id} />
              <PublicityBioField name="bio" label={`Bio for ${submission.projects?.title ?? "this production"}`} initialValue={submission.bio} previewName={submission.credited_name} previewRole={previewRole} compact />
              <button type="submit" className="secondary">Save show-specific bio</button>
            </form>}
            {submission.headshot_url ? <p><a href={submission.headshot_url} target="_blank" rel="noreferrer">Review production headshot</a></p> : <p className="setup-warning">A headshot is still needed. Upload the reusable headshot above.</p>}
            {!locked && ["draft", "awaiting_person_approval", "changes_requested"].includes(submission.status) ? <form action={approveMyPublicitySubmissionAction}><input type="hidden" name="submissionId" value={submission.id} /><button type="submit">Approve &amp; submit to Playbill</button></form> : null}
            {locked ? <p className="muted">This final Playbill copy remains here for historical reference and can no longer be changed.</p> : null}
          </article>;
        }) : <p className="muted">No production publicity records yet.</p>}
      </div></section>
    </div>
  );
}
