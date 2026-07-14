import Link from "next/link";
import { projectWorkspacePath } from "@/lib/project-routes";

const workspaceItems = [
  { key: "overview", label: "Overview" },
  { key: "roles", label: "Roles & Assignments" },
  { key: "people", label: "People" },
  { key: "integrations", label: "Integrations" }
] as const;

export function ProjectWorkspaceNav({ projectId, active }: { projectId: string; active: string }) {
  return (
    <nav className="project-workspace-tabs" aria-label="Project workspace">
      {workspaceItems.map((item) => (
        <Link
          aria-current={active === item.key ? "page" : undefined}
          className={active === item.key ? "active" : ""}
          href={projectWorkspacePath(projectId, item.key)}
          key={item.key}
        >
          {item.label}
        </Link>
      ))}
      <Link aria-current={active === "publicity" ? "page" : undefined} className={active === "publicity" ? "active" : ""} href={`/projects/${projectId}/publicity`}>Publicity</Link>
      <Link aria-current={active === "onboarding" ? "page" : undefined} className={active === "onboarding" ? "active" : ""} href={`/projects/${projectId}/onboarding`}>Onboarding</Link>
      <Link aria-current={active === "auditions" ? "page" : undefined} className={active === "auditions" ? "active" : ""} href={`/projects/${projectId}/auditions`}>Auditions</Link>
      <Link aria-current={active === "google-groups" ? "page" : undefined} className={active === "google-groups" ? "active" : ""} href={`/projects/${projectId}/google-groups`}>Google Groups</Link>
      <Link aria-current={active === "communications" ? "page" : undefined} className={active === "communications" ? "active" : ""} href={`/projects/${projectId}/communications`}>Communications</Link>
      <Link aria-current={active === "dashboards" ? "page" : undefined} className={active === "dashboards" ? "active" : ""} href={`/projects/${projectId}/dashboards`}>Dashboards</Link>
    </nav>
  );
}
