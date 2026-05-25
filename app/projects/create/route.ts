import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, new URL(request.url).origin));
}

function projectErrorPath(message: string) {
  return `/projects?error=${encodeURIComponent(message)}`;
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectTo(request, "/login?error=Please sign in before creating a project.");
  }

  const formData = await request.formData();
  const parsed = projectSchema.safeParse({
    title: formData.get("title"),
    projectType: formData.get("projectType"),
    startsOn: formData.get("startsOn"),
    endsOn: formData.get("endsOn")
  });

  if (!parsed.success) {
    return redirectTo(request, projectErrorPath(parsed.error.issues[0]?.message ?? "Invalid project."));
  }

  const input = parsed.data;
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
    return redirectTo(request, projectErrorPath(error?.message ?? "Could not create project."));
  }

  const { error: membershipError } = await supabase.from("project_memberships").insert({
    project_id: String(project.id),
    user_id: user.id,
    role: "project_manager",
    title: "Project Manager"
  });

  if (membershipError) {
    return redirectTo(request, projectErrorPath(membershipError.message));
  }

  return redirectTo(request, `/projects/${String(project.id)}`);
}
