import { redirect } from "next/navigation";
import { isProjectWorkspace, projectWorkspacePath } from "@/lib/project-routes";

export default async function LegacyProjectPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams?: Promise<{ workspace?: string; error?: string; success?: string }> }) {
  const { projectId } = await params;
  const query = await searchParams;
  const workspace = isProjectWorkspace(query?.workspace) ? query.workspace : "overview";
  redirect(projectWorkspacePath(projectId, workspace, { error: query?.error, success: query?.success }));
}
