import Link from "next/link";

const workspaceItems = [
  { key: "overview", label: "Overview" },
  { key: "calendar", label: "Calendar" },
  { key: "timeline", label: "Timeline" },
  { key: "roles", label: "Roles & Assignments" },
  { key: "people", label: "People" },
  { key: "integrations", label: "Integrations" },
  { key: "run-of-show", label: "Run of Show" }
] as const;

export function ProjectWorkspaceNav({ projectId, active }: { projectId: string; active: string }) {
  return (
    <nav className="project-workspace-tabs" aria-label="Project workspace">
      {workspaceItems.map((item) => (
        <Link
          aria-current={active === item.key ? "page" : undefined}
          className={active === item.key ? "active" : ""}
          href={`/projects/${projectId}?workspace=${item.key}`}
          key={item.key}
        >
          {item.label}
        </Link>
      ))}
      <Link aria-current={active === "publicity" ? "page" : undefined} className={active === "publicity" ? "active" : ""} href={`/projects/${projectId}/publicity`}>Publicity</Link>
      <Link aria-current={active === "auditions" ? "page" : undefined} className={active === "auditions" ? "active" : ""} href={`/projects/${projectId}/auditions`}>Auditions</Link>
      <Link aria-current={active === "google-groups" ? "page" : undefined} className={active === "google-groups" ? "active" : ""} href={`/projects/${projectId}/google-groups`}>Google Groups</Link>
      <Link aria-current={active === "dashboards" ? "page" : undefined} className={active === "dashboards" ? "active" : ""} href={`/projects/${projectId}/dashboards`}>Dashboards</Link>
    </nav>
  );
}
