import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { sendPersonProfileAccessLinkAction, updatePersonProfileAction } from "@/app/people/actions";
import { ProfileHeadshotUploader } from "@/components/profile-headshot-uploader";

export const dynamic = "force-dynamic";

type Person = {
  id: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  preferred_name: string;
  full_name: string;
  email: string;
  vendor_number: string;
  phone: string;
  pronouns: string;
  affiliation: string;
  person_type: string;
  status: string;
  publicity_bio: string;
  publicity_headshot_url: string;
  publicity_profile_version: number;
};

type AssignmentRow = {
  id: string;
  project_id: string;
  role_id: string;
  status: string;
  confirmation_status: string;
  is_guest_artist: boolean;
  projects: { id: string; title: string; project_type: string; status: string } | null;
  project_roles: { id: string; name: string; role_group: string; department: string } | null;
};

type NoteRow = {
  id: string;
  project_id: string | null;
  visibility: string;
  note: string;
  is_pinned: boolean;
  created_at: string;
  projects: { id: string; title: string } | null;
};

type AccomplishmentRow = {
  id: string;
  project_id: string | null;
  accomplishment_type: string;
  title: string;
  issuer: string;
  awarded_on: string | null;
  description: string;
  projects: { id: string; title: string } | null;
};

type ExternalLinkRow = {
  id: string;
  external_app: string;
  external_schema: string;
  external_table: string;
  external_id: string;
  sync_direction: string;
  sync_status: string;
};

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | null) {
  if (!value) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00.000Z`)
  );
}

export default async function PersonPage({
  params,
  searchParams
}: {
  params: Promise<{ personId: string }>;
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  await requireUser();
  const { personId } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [
    { data: person },
    { data: assignments },
    { data: notes },
    { data: accomplishments },
    { data: personExternalLinks },
    { data: managementDetails }
  ] = await Promise.all([
    supabase
      .from("people")
      .select(
        "id, first_name, middle_name, last_name, preferred_name, full_name, email, vendor_number, phone, pronouns, affiliation, person_type, status, publicity_bio, publicity_headshot_url, publicity_profile_version"
      )
      .eq("id", personId)
      .maybeSingle(),
    supabase
      .from("role_assignments")
      .select(
        "id, project_id, role_id, status, confirmation_status, is_guest_artist, projects(id, title, project_type, status), project_roles(id, name, role_group, department)"
      )
      .eq("person_id", personId)
      .order("created_at", { ascending: false }),
    supabase
      .from("person_notes")
      .select("id, project_id, visibility, note, is_pinned, created_at, projects(id, title)")
      .eq("person_id", personId)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("profile_accomplishments")
      .select("id, project_id, accomplishment_type, title, issuer, awarded_on, description, projects(id, title)")
      .eq("person_id", personId)
      .order("awarded_on", { ascending: false }),
    supabase
      .from("external_links")
      .select("id, external_app, external_schema, external_table, external_id, sync_direction, sync_status")
      .eq("local_entity_type", "person")
      .eq("local_entity_id", personId),
    supabase.from("person_management_details").select("notes").eq("person_id", personId).maybeSingle()
  ]);

  if (!person) {
    notFound();
  }

  const typedPerson = person as Person;
  const assignmentRows = (assignments ?? []) as unknown as AssignmentRow[];
  const assignmentIds = assignmentRows.map((assignment) => assignment.id);
  const { data: assignmentExternalLinks } = assignmentIds.length
    ? await supabase
        .from("external_links")
        .select("id, external_app, external_schema, external_table, external_id, sync_direction, sync_status")
        .eq("local_entity_type", "role_assignment")
        .in("local_entity_id", assignmentIds)
    : { data: [] };
  const noteRows = (notes ?? []) as unknown as NoteRow[];
  const accomplishmentRows = (accomplishments ?? []) as unknown as AccomplishmentRow[];
  const externalLinks = [
    ...((personExternalLinks ?? []) as ExternalLinkRow[]),
    ...((assignmentExternalLinks ?? []) as ExternalLinkRow[])
  ];

  return (
    <div className="page workspace-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Person Profile</p>
          <h1>{typedPerson.full_name}</h1>
          <p className="muted">
            {titleCase(typedPerson.person_type)}
            {typedPerson.vendor_number ? ` · 90# ${typedPerson.vendor_number}` : ""}
            {typedPerson.email ? ` · ${typedPerson.email}` : ""}
          </p>
        </div>
        <div className="top-actions">
          <form action={sendPersonProfileAccessLinkAction}>
            <input type="hidden" name="personId" value={typedPerson.id} />
            <button type="submit">Send secure profile link</button>
          </form>
          <Link className="button secondary" href="/people">
            People
          </Link>
          <Link className="button secondary" href="/projects">
            Projects
          </Link>
        </div>
      </div>

      {query?.error ? <p className="setup-warning">{query.error}</p> : null}
      {query?.success ? <p className="setup-success">{query.success}</p> : null}

      <section className="workspace-summary" aria-label="Person summary">
        <div>
          <span>{assignmentRows.length}</span>
          <p>Role Assignments</p>
        </div>
        <div>
          <span>{new Set(assignmentRows.map((assignment) => assignment.project_id)).size}</span>
          <p>Projects</p>
        </div>
        <div>
          <span>{noteRows.length}</span>
          <p>Notes</p>
        </div>
        <div>
          <span>{accomplishmentRows.length}</span>
          <p>Accomplishments</p>
        </div>
      </section>

      <div className="grid two">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Profile</p>
              <h2>Basics</h2>
            </div>
          </div>
          <form action={updatePersonProfileAction} className="stacked-form">
            <input name="id" type="hidden" value={typedPerson.id} />
            <label className="field">
              <span>Full name</span>
              <input name="fullName" defaultValue={typedPerson.full_name} required />
            </label>
            <div className="form-row">
              <label className="field">
                <span>First name</span>
                <input name="firstName" defaultValue={typedPerson.first_name} />
              </label>
              <label className="field">
                <span>Middle name</span>
                <input name="middleName" defaultValue={typedPerson.middle_name} />
              </label>
            </div>
            <label className="field"><span>Last name</span><input name="lastName" defaultValue={typedPerson.last_name} /></label>
            <div className="form-row">
              <label className="field">
                <span>Preferred name</span>
                <input name="preferredName" defaultValue={typedPerson.preferred_name} />
              </label>
              <label className="field">
                <span>Pronouns</span>
                <input name="pronouns" defaultValue={typedPerson.pronouns} />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                <span>Email</span>
                <input name="email" defaultValue={typedPerson.email} type="email" />
              </label>
              <label className="field">
                <span>Vendor / 90#</span>
                <input name="vendorNumber" defaultValue={typedPerson.vendor_number} />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                <span>Phone</span>
                <input name="phone" defaultValue={typedPerson.phone} />
              </label>
              <label className="field">
                <span>Person type</span>
                <select name="personType" defaultValue={typedPerson.person_type}>
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
            <div className="form-row">
              <label className="field">
                <span>Affiliation</span>
                <input name="affiliation" defaultValue={typedPerson.affiliation} />
              </label>
              <label className="field">
                <span>Status</span>
                <select name="status" defaultValue={typedPerson.status}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
            </div>
            <label className="field">
              <span>Profile notes</span>
              <textarea name="notes" defaultValue={String(managementDetails?.notes ?? "")} rows={4} />
            </label>
            <label className="field">
              <span>Reusable publicity bio</span>
              <textarea name="publicityBio" defaultValue={typedPerson.publicity_bio} rows={10} />
            </label>
            <label className="field">
              <span>Primary headshot URL</span>
              <input name="publicityHeadshotUrl" defaultValue={typedPerson.publicity_headshot_url} type="url" placeholder="https://…" />
            </label>
            <p className="muted">Profile version {typedPerson.publicity_profile_version}. Production copies remain frozen until deliberately refreshed.</p>
            <button type="submit">Save profile</button>
          </form>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Headshot</p>
              <h2>Playbill-Ready Asset</h2>
              <p className="muted">
                Crop and save a reusable 1:1 headshot for Production Management, Playbill, and Propared.
              </p>
            </div>
          </div>
          {typedPerson.publicity_headshot_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={typedPerson.publicity_headshot_url} alt={`${typedPerson.full_name} headshot`} style={{ width: "100%", maxWidth: 320, borderRadius: 12 }} />
          ) : <div className="headshot-placeholder"><span>{typedPerson.full_name.slice(0, 1).toUpperCase()}</span></div>}
          <ProfileHeadshotUploader personId={typedPerson.id} />
        </section>
      </div>

      <section className="panel workspace-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Resume Log</p>
            <h2>Project And Role History</h2>
          </div>
        </div>
        <div className="table-list">
          {assignmentRows.length ? (
            assignmentRows.map((assignment) => (
              <div className="table-row" key={assignment.id}>
                <div>
                  <strong>{assignment.project_roles?.name ?? "Unknown role"}</strong>
                  <span>
                    {assignment.projects?.title ?? "Unknown project"} · {titleCase(assignment.status)}
                    {assignment.is_guest_artist ? " · Guest Artist" : ""}
                  </span>
                </div>
                <span>
                  {assignment.project_roles?.role_group ? titleCase(assignment.project_roles.role_group) : "Role"}
                  {assignment.project_roles?.department ? ` · ${assignment.project_roles.department}` : ""}
                </span>
                {assignment.projects?.id ? (
                  <Link className="button secondary" href={`/projects/${assignment.projects.id}`}>
                    Project
                  </Link>
                ) : null}
              </div>
            ))
          ) : (
            <p className="muted">No role history yet.</p>
          )}
        </div>
      </section>

      <div className="grid two workspace-lower">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Notes</p>
              <h2>Production Notes</h2>
            </div>
          </div>
          <div className="compact-list">
            {noteRows.length ? (
              noteRows.map((note) => (
                <div className="compact-row" key={note.id}>
                  <div>
                    <strong>
                      {note.is_pinned ? "Pinned · " : ""}
                      {note.visibility === "client_visible" ? "Client visible" : "Internal"}
                    </strong>
                    <span>
                      {note.projects?.title ?? "General profile"} · {note.note}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No notes yet.</p>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Recognition</p>
              <h2>Accomplishments</h2>
            </div>
          </div>
          <div className="compact-list">
            {accomplishmentRows.length ? (
              accomplishmentRows.map((accomplishment) => (
                <div className="compact-row" key={accomplishment.id}>
                  <div>
                    <strong>{accomplishment.title}</strong>
                    <span>
                      {titleCase(accomplishment.accomplishment_type)} · {accomplishment.issuer || "Unknown issuer"} ·{" "}
                      {formatDate(accomplishment.awarded_on)}
                    </span>
                    {accomplishment.description ? <span>{accomplishment.description}</span> : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No accomplishments yet.</p>
            )}
          </div>
        </section>
      </div>

      <section className="panel workspace-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Integrations</p>
            <h2>External Links</h2>
          </div>
        </div>
        <div className="compact-list">
          {externalLinks.length ? (
            externalLinks.map((link) => (
              <div className="compact-row" key={link.id}>
                <div>
                  <strong>{titleCase(link.external_app)}</strong>
                  <span>
                    {link.external_schema}.{link.external_table} · {link.sync_status} · {link.external_id}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">No external links yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
