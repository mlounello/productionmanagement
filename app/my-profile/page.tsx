import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  approveMyPublicitySubmissionAction,
  connectMyProfileAction,
  updateMyPublicityProfileAction
} from "@/app/my-profile/actions";

export const dynamic = "force-dynamic";

type Profile = {
  id: string;
  full_name: string;
  preferred_name: string;
  email: string;
  phone: string;
  pronouns: string;
  publicity_bio: string;
  publicity_headshot_url: string;
  publicity_profile_version: number;
  publicity_profile_updated_at: string | null;
};

type Submission = {
  id: string;
  credited_name: string;
  bio: string;
  headshot_url: string;
  status: string;
  source_profile_version: number;
  projects: { title: string } | null;
};

function statusLabel(value: string) {
  return value.split("_").map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join(" ");
}

export default async function MyProfilePage({ searchParams }: { searchParams?: Promise<{ error?: string; success?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("people")
    .select("id, full_name, preferred_name, email, phone, pronouns, publicity_bio, publicity_headshot_url, publicity_profile_version, publicity_profile_updated_at")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile) {
    return (
      <div className="page workspace-page">
        <section className="panel" style={{ maxWidth: 680 }}>
          <p className="eyebrow">My Publicity Profile</p>
          <h1>Connect your profile</h1>
          <p className="muted">We will match your signed-in email to the person already on file. If no match exists, a new profile will be created.</p>
          {query?.error ? <p className="setup-warning">{query.error}</p> : null}
          <form action={connectMyProfileAction}><button type="submit">Connect my profile</button></form>
        </section>
      </div>
    );
  }

  const typedProfile = profile as Profile;
  const { data: submissions } = await supabase
    .from("project_publicity_submissions")
    .select("id, credited_name, bio, headshot_url, status, source_profile_version, projects(title)")
    .eq("person_id", typedProfile.id)
    .order("updated_at", { ascending: false });
  const rows = (submissions ?? []) as unknown as Submission[];

  return (
    <div className="page workspace-page">
      <div className="page-header">
        <div><p className="eyebrow">My Publicity Profile</p><h1>{typedProfile.full_name}</h1><p className="muted">Your reusable bio and headshot live here. Each production receives a frozen copy for your approval.</p></div>
      </div>
      {query?.error ? <p className="setup-warning">{query.error}</p> : null}
      {query?.success ? <p className="setup-success">{query.success}</p> : null}

      <div className="grid two">
        <section className="panel">
          <p className="eyebrow">Reusable Profile</p><h2>Bio and headshot</h2>
          <form action={updateMyPublicityProfileAction} className="stacked-form">
            <input type="hidden" name="personId" value={typedProfile.id} />
            <div className="form-row">
              <label className="field"><span>Preferred name</span><input name="preferredName" defaultValue={typedProfile.preferred_name} /></label>
              <label className="field"><span>Pronouns</span><input name="pronouns" defaultValue={typedProfile.pronouns} /></label>
            </div>
            <label className="field"><span>Phone</span><input name="phone" defaultValue={typedProfile.phone} /></label>
            <label className="field"><span>Primary headshot URL</span><input name="headshotUrl" type="url" defaultValue={typedProfile.publicity_headshot_url} placeholder="https://…" /></label>
            <label className="field"><span>Reusable bio</span><textarea name="bio" rows={12} defaultValue={typedProfile.publicity_bio} /></label>
            <p className="muted">Profile version {typedProfile.publicity_profile_version}. Saving does not silently change a production you already approved.</p>
            <button type="submit">Save reusable profile</button>
          </form>
        </section>
        <section className="panel">
          <p className="eyebrow">Production Approvals</p><h2>Review requested copies</h2>
          <div className="compact-list">
            {rows.length ? rows.map((submission) => (
              <article className="panel" key={submission.id}>
                <div className="section-heading"><div><strong>{submission.projects?.title ?? "Production"}</strong><p className="muted">{statusLabel(submission.status)}</p></div><span className="status-badge">v{submission.source_profile_version}</span></div>
                <p><strong>Credit:</strong> {submission.credited_name}</p>
                <p style={{ whiteSpace: "pre-wrap" }}>{submission.bio || "No bio supplied."}</p>
                {submission.headshot_url ? <p><a href={submission.headshot_url} target="_blank" rel="noreferrer">Review headshot</a></p> : <p className="muted">No headshot supplied.</p>}
                {['awaiting_person_approval', 'changes_requested'].includes(submission.status) ? (
                  <form action={approveMyPublicitySubmissionAction}><input type="hidden" name="submissionId" value={submission.id} /><button type="submit">Approve this production copy</button></form>
                ) : null}
              </article>
            )) : <p className="muted">No production approval requests yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
