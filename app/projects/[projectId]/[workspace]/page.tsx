import { notFound, redirect } from "next/navigation";
import ProjectWorkspacePage from "@/components/project-workspace-page";
import { isPausedProjectWorkspace, isProjectWorkspace } from "@/lib/project-routes";

export const dynamic = "force-dynamic";

export default async function ProjectWorkspaceRoute({ params, searchParams }: { params: Promise<{ projectId: string; workspace: string }>; searchParams?: Promise<{ error?: string; success?: string }> }) {
  const { projectId, workspace } = await params;
  if (!isProjectWorkspace(workspace)) notFound();
  if (isPausedProjectWorkspace(workspace)) redirect(`/projects/${projectId}/overview`);
  return <ProjectWorkspacePage projectId={projectId} workspace={workspace} query={await searchParams} />;
}
