"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/auth";

const projectSchema = z.object({
  title: z.string().trim().min(1, "Project title is required.").max(160),
  projectType: z.enum(["theatre_production", "campus_event", "rental", "support_job", "other"]),
  startsOn: z.string().trim().optional(),
  endsOn: z.string().trim().optional()
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 70);
}

export async function createProjectAction(formData: FormData) {
  const user = await requireUser();
  const parsed = projectSchema.safeParse({
    title: formData.get("title"),
    projectType: formData.get("projectType"),
    startsOn: formData.get("startsOn"),
    endsOn: formData.get("endsOn")
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid project.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const slugBase = slugify(input.title) || "project";
  const slug = `${slugBase}-${Date.now().toString(36)}`;

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      title: input.title,
      slug,
      project_type: input.projectType,
      starts_on: input.startsOn || null,
      ends_on: input.endsOn || null,
      created_by: user.id
    })
    .select("id")
    .single();

  if (error || !project) {
    redirect(`/projects?error=${encodeURIComponent(error?.message ?? "Could not create project.")}`);
  }

  const { error: membershipError } = await supabase.from("project_memberships").insert({
    project_id: project.id,
    user_id: user.id,
    role: "project_manager",
    title: "Project Manager"
  });

  if (membershipError) {
    redirect(`/projects?error=${encodeURIComponent(membershipError.message)}`);
  }

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}
