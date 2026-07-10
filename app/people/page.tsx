import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type PersonRow = {
  id: string;
  full_name: string;
  preferred_name: string;
  email: string;
  vendor_number: string;
  phone: string;
  affiliation: string;
  person_type: string;
  status: string;
};

function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function matchesSearch(person: PersonRow, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    person.full_name,
    person.preferred_name,
    person.email,
    person.vendor_number,
    person.phone,
    person.affiliation,
    person.person_type
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

export default async function PeoplePage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string; error?: string; success?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const query = params?.q?.trim() ?? "";
  const supabase = await createSupabaseServerClient();
  const [{ data: people, error }, { data: assignments }, { data: notes }] = await Promise.all([
    supabase
      .from("people")
      .select("id, full_name, preferred_name, email, vendor_number, phone, affiliation, person_type, status")
      .order("full_name", { ascending: true }),
    supabase.from("role_assignments").select("person_id, project_id"),
    supabase.from("person_notes").select("person_id")
  ]);

  const rows = ((people ?? []) as PersonRow[]).filter((person) => matchesSearch(person, query));
  const assignmentRows = (assignments ?? []) as Array<{ person_id: string; project_id: string }>;
  const noteRows = (notes ?? []) as Array<{ person_id: string }>;
  const assignmentsByPerson = new Map<string, Array<{ person_id: string; project_id: string }>>();
  const notesByPerson = new Map<string, number>();

  assignmentRows.forEach((assignment) => {
    const existing = assignmentsByPerson.get(assignment.person_id) ?? [];
    existing.push(assignment);
    assignmentsByPerson.set(assignment.person_id, existing);
  });

  noteRows.forEach((note) => {
    notesByPerson.set(note.person_id, (notesByPerson.get(note.person_id) ?? 0) + 1);
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">People Files</p>
          <h1>People</h1>
          <p className="muted">Search durable profiles by name, email, role context, or Vendor / 90#.</p>
        </div>
        <Link className="button secondary" href="/projects">
          Projects
        </Link>
      </div>

      {params?.error ? <p className="setup-warning">{params.error}</p> : null}
      {params?.success ? <p className="setup-success">{params.success}</p> : null}

      <section className="panel">
        <form className="people-search-form">
          <label className="field">
            <span>Search people</span>
            <input defaultValue={query} name="q" placeholder="Name, email, 90#, affiliation..." />
          </label>
          <button type="submit">Search</button>
          {query ? (
            <Link className="button secondary" href="/people">
              Clear
            </Link>
          ) : null}
        </form>
      </section>

      <section className="panel workspace-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Directory</p>
            <h2>{rows.length} People</h2>
          </div>
        </div>
        {error ? <p className="setup-warning">{error.message}</p> : null}
        <div className="table-list">
          {rows.length ? (
            rows.map((person) => {
              const personAssignments = assignmentsByPerson.get(person.id) ?? [];
              const projectCount = new Set(personAssignments.map((assignment) => assignment.project_id)).size;
              const noteCount = notesByPerson.get(person.id) ?? 0;

              return (
                <div className="table-row" key={person.id}>
                  <div>
                    <strong>{person.full_name}</strong>
                    <span>
                      {titleCase(person.person_type)}
                      {person.vendor_number ? ` · 90# ${person.vendor_number}` : ""}
                      {person.email ? ` · ${person.email}` : ""}
                      {person.affiliation ? ` · ${person.affiliation}` : ""}
                    </span>
                  </div>
                  <span>
                    {personAssignments.length} role{personAssignments.length === 1 ? "" : "s"} · {projectCount} project
                    {projectCount === 1 ? "" : "s"} · {noteCount} note{noteCount === 1 ? "" : "s"}
                  </span>
                  <Link className="button secondary" href={`/people/${person.id}`}>
                    Open
                  </Link>
                </div>
              );
            })
          ) : (
            <p className="muted">No matching people yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
