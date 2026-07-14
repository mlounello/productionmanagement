import Link from "next/link";
import { getMissingSupabaseEnvVars, hasSupabaseEnv } from "@/lib/config";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ProjectCreateForm } from "@/app/projects/project-create-form";
import { fetchActiveDepartments, fetchActiveLocations, fetchActiveReferenceValues } from "@/lib/reference-data";

export const dynamic = "force-dynamic";

type ProjectRow = {
  id: string;
  title: string;
  project_type: string;
  status: string;
  starts_on: string | null;
  ends_on: string | null;
};

function formatProjectType(value: string) {
  return value
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function ProjectsPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  if (!hasSupabaseEnv()) {
    return (
      <div className="page">
        <section className="panel setup-warning">
          <h1>Supabase setup needed</h1>
          <p>Missing env vars: {getMissingSupabaseEnvVars().join(", ")}</p>
        </section>
      </div>
    );
  }

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: role }, departments, locations, projectTypes] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, project_type, status, starts_on, ends_on")
      .order("created_at", { ascending: false }),
    supabase.rpc("get_user_role"),
    fetchActiveDepartments(),
    fetchActiveLocations(),
    fetchActiveReferenceValues("project_type")
  ]);

  const projects = (data ?? []) as ProjectRow[];
  const appRole = typeof role === "string" ? role : "none";

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Foundation</p>
          <h1>Projects</h1>
          <p className="muted">
            Create theatre productions, events, rentals, support jobs, and future operational work.
          </p>
          <p className="muted session-note">
            Signed in as {user.email ?? "unknown user"} · Production Management role: {appRole}
          </p>
        </div>
      </div>

      <div className="grid two">
        <section className="panel">
          <h2>Active Work</h2>
          {error ? <p className="setup-warning">{error.message}</p> : null}
          {params?.error ? <p className="setup-warning">{params.error}</p> : null}
          <div className="project-list">
            {projects.length === 0 ? <p className="muted">No projects yet.</p> : null}
            {projects.map((project) => (
              <div className="project-row" key={project.id}>
                <div>
                  <strong>{project.title}</strong>
                  <span className="muted">
                    {formatProjectType(project.project_type)} · {project.status}
                  </span>
                </div>
                <Link className="button secondary" href={`/projects/${project.id}/overview`}>
                  Open
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Create Project</h2>
          {appRole === "none" ? (
            <p className="setup-warning">
              Your account is signed in but does not have access to create Production Management projects yet.
            </p>
          ) : null}
          <ProjectCreateForm
            departments={departments}
            disabled={appRole === "none"}
            locations={locations}
            projectTypes={projectTypes}
          />
        </section>
      </div>
    </div>
  );
}
