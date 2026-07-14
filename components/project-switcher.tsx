"use client";

import { useRouter } from "next/navigation";

export function ProjectSwitcher({ currentProjectId, workspace, projects }: { currentProjectId: string; workspace: string; projects: Array<{ id: string; title: string }> }) {
  const router = useRouter();
  return (
    <label className="project-switcher">
      <span className="sr-only">Switch project</span>
      <select aria-label="Switch project" value={currentProjectId} onChange={(event) => router.push(`/projects/${event.target.value}/${workspace}`)}>
        {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
      </select>
    </label>
  );
}
