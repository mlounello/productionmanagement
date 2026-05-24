import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type Project = {
  id: string;
  title: string;
  project_type: string;
  status: string;
  starts_on: string | null;
  ends_on: string | null;
};

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, title, project_type, status, starts_on, ends_on")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) {
    notFound();
  }

  const typedProject = project as Project;
  const { data: calendarItems } = await supabase
    .from("calendar_items")
    .select("id, title, item_type, starts_at, ends_at, due_at, status")
    .eq("project_id", typedProject.id)
    .order("starts_at", { ascending: true });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{typedProject.project_type.replaceAll("_", " ")}</p>
          <h1>{typedProject.title}</h1>
          <p className="muted">Project workspace foundation: team, calendar, Gantt, run of show, roles, and auditions.</p>
        </div>
        <Link className="button secondary" href="/projects">
          Projects
        </Link>
      </div>

      <div className="grid">
        <section className="panel">
          <h2>Next Foundation Modules</h2>
          <p className="muted">
            Calendar and Gantt data tables are in the initial migration. The next UI pass will add editable
            calendar items, expandable Gantt windows, and run-of-show rows.
          </p>
        </section>
        <section className="panel">
          <h2>Calendar Items</h2>
          {calendarItems?.length ? (
            <div className="project-list">
              {calendarItems.map((item) => (
                <div className="project-row" key={String(item.id)}>
                  <div>
                    <strong>{String(item.title)}</strong>
                    <span className="muted">{String(item.item_type)} · {String(item.status)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No calendar items yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
