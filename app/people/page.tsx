import Link from "next/link";
import { PeopleDirectory, type DirectoryPerson } from "@/components/people-directory";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type PersonRow = {
  id: string; full_name: string; first_name: string; middle_name: string; last_name: string; preferred_name: string;
  pronouns: string; email: string; vendor_number: string; phone: string; affiliation: string; person_type: string;
  status: string; publicity_headshot_url: string;
};

type AssignmentRow = {
  id: string; person_id: string; project_id: string; status: string; is_guest_artist: boolean;
  projects: { title: string } | Array<{ title: string }> | null;
  project_roles: { name: string; role_group: string } | Array<{ name: string; role_group: string }> | null;
};

function relation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function PeoplePage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [{ data: people, error }, { data: assignments }, { data: notes }, { data: managementDetails }] = await Promise.all([
    supabase.from("people").select("id, full_name, first_name, middle_name, last_name, preferred_name, pronouns, email, vendor_number, phone, affiliation, person_type, status, publicity_headshot_url").order("full_name", { ascending: true }),
    supabase.from("role_assignments").select("id, person_id, project_id, status, is_guest_artist, projects(title), project_roles(name, role_group)"),
    supabase.from("person_notes").select("person_id"),
    supabase.from("person_management_details").select("person_id, notes")
  ]);

  const assignmentRows = (assignments ?? []) as unknown as AssignmentRow[];
  const noteCounts = new Map<string, number>();
  (notes ?? []).forEach((note) => noteCounts.set(note.person_id, (noteCounts.get(note.person_id) ?? 0) + 1));
  const managementNotes = new Map((managementDetails ?? []).map((row) => [row.person_id, String(row.notes ?? "")]));

  const directoryPeople: DirectoryPerson[] = ((people ?? []) as PersonRow[]).map((person) => {
    const personAssignments = assignmentRows.filter((assignment) => assignment.person_id === person.id);
    return {
      id: person.id,
      fullName: person.full_name,
      firstName: person.first_name ?? "",
      middleName: person.middle_name ?? "",
      lastName: person.last_name ?? "",
      preferredName: person.preferred_name ?? "",
      pronouns: person.pronouns ?? "",
      email: person.email ?? "",
      vendorNumber: person.vendor_number ?? "",
      phone: person.phone ?? "",
      affiliation: person.affiliation ?? "",
      personType: person.person_type ?? "person",
      status: person.status ?? "active",
      headshotUrl: person.publicity_headshot_url ?? "",
      managementNotes: managementNotes.get(person.id) ?? "",
      noteCount: noteCounts.get(person.id) ?? 0,
      projectCount: new Set(personAssignments.map((assignment) => assignment.project_id)).size,
      notes: [],
      roles: personAssignments.map((assignment) => {
        const role = relation(assignment.project_roles);
        return {
          id: assignment.id,
          name: role?.name ?? "Unknown role",
          group: role?.role_group ?? "other",
          status: assignment.status,
          projectTitle: relation(assignment.projects)?.title ?? "Unknown project",
          guestArtist: assignment.is_guest_artist
        };
      })
    };
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">People Database</p>
          <h1>People</h1>
          <p className="muted">Search the complete contact database, then select a row to view or edit the person.</p>
        </div>
        <Link className="button secondary" href="/projects">Projects</Link>
      </div>
      {params?.error ? <p className="setup-warning">{params.error}</p> : null}
      {params?.success ? <p className="setup-success">{params.success}</p> : null}
      {error ? <p className="setup-warning">{error.message}</p> : null}
      <section className="panel workspace-section people-directory-panel">
        <PeopleDirectory people={directoryPeople} returnTo="/people" />
      </section>
    </div>
  );
}
