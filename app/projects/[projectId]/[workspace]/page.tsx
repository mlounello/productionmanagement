import { notFound } from "next/navigation";
import ProjectWorkspacePage from "@/components/project-workspace-page";
import { isProjectWorkspace } from "@/lib/project-routes";

export const dynamic = "force-dynamic";

export default async function ProjectWorkspaceRoute({ params, searchParams }: { params: Promise<{ projectId: string; workspace: string }>; searchParams?: Promise<{ error?: string; success?: string }> }) {
  const { projectId, workspace } = await params;
  if (!isProjectWorkspace(workspace)) notFound();
  return <ProjectWorkspacePage projectId={projectId} workspace={workspace} query={await searchParams} />;
}
