export const projectWorkspaceKeys = ["overview", "calendar", "timeline", "roles", "people", "integrations", "run-of-show"] as const;
export type ProjectWorkspaceKey = (typeof projectWorkspaceKeys)[number];

export function isProjectWorkspace(value: string | null | undefined): value is ProjectWorkspaceKey {
  return projectWorkspaceKeys.includes(value as ProjectWorkspaceKey);
}

export function projectWorkspacePath(projectId: string, workspace: ProjectWorkspaceKey = "overview", params?: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) if (value) search.set(key, value);
  return `/projects/${projectId}/${workspace}${search.size ? `?${search.toString()}` : ""}`;
}
