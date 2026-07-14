import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ProjectSwitcher } from "@/components/project-switcher";

export async function ProjectContextSwitcher({ projectId, workspace }: { projectId: string; workspace: string }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("projects").select("id, title").order("title");
  const projects = data ?? [];
  if (!projects.length) return null;
  return <ProjectSwitcher currentProjectId={projectId} workspace={workspace} projects={projects} />;
}
