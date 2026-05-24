"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const projectIdSchema = z.string().uuid();

const calendarItemSchema = z.object({
  projectId: projectIdSchema,
  title: z.string().trim().min(1, "Calendar title is required.").max(180),
  itemType: z.enum(["window", "task", "event", "milestone", "deadline", "run_of_show"]),
  department: z.string().trim().max(80).optional(),
  location: z.string().trim().max(120).optional(),
  startsOn: z.string().trim().optional(),
  endsOn: z.string().trim().optional(),
  dueOn: z.string().trim().optional()
});

const projectRoleSchema = z.object({
  projectId: projectIdSchema,
  name: z.string().trim().min(1, "Role name is required.").max(120),
  roleGroup: z.enum(["production_team", "cast", "crew", "designer", "department_head", "staff", "guest_artist"]),
  department: z.string().trim().max(80).optional()
});

const runOfShowSchema = z.object({
  projectId: projectIdSchema,
  cueNumber: z.string().trim().max(40).optional(),
  title: z.string().trim().min(1, "Run-of-show title is required.").max(160),
  startsAt: z.string().trim().optional(),
  durationMinutes: z.coerce.number().int().min(0).max(24 * 60).optional()
});

function dateToTimestamp(value?: string) {
  if (!value) {
    return null;
  }

  return `${value}T12:00:00.000Z`;
}

function datetimeToTimestamp(value?: string) {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

function projectErrorPath(projectId: string, message: string) {
  return `/projects/${projectId}?error=${encodeURIComponent(message)}`;
}

export async function createCalendarItemAction(formData: FormData) {
  await requireUser();
  const parsed = calendarItemSchema.safeParse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    itemType: formData.get("itemType"),
    department: formData.get("department"),
    location: formData.get("location"),
    startsOn: formData.get("startsOn"),
    endsOn: formData.get("endsOn"),
    dueOn: formData.get("dueOn")
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid calendar item.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("calendar_items").insert({
    project_id: input.projectId,
    title: input.title,
    item_type: input.itemType,
    department: input.department ?? "",
    location: input.location ?? "",
    starts_at: dateToTimestamp(input.startsOn),
    ends_at: dateToTimestamp(input.endsOn),
    due_at: dateToTimestamp(input.dueOn),
    all_day: true
  });

  if (error) {
    redirect(projectErrorPath(input.projectId, error.message));
  }

  revalidatePath(`/projects/${input.projectId}`);
}

export async function createProjectRoleAction(formData: FormData) {
  await requireUser();
  const parsed = projectRoleSchema.safeParse({
    projectId: formData.get("projectId"),
    name: formData.get("name"),
    roleGroup: formData.get("roleGroup"),
    department: formData.get("department")
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid project role.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("project_roles").insert({
    project_id: input.projectId,
    name: input.name,
    role_group: input.roleGroup,
    department: input.department ?? ""
  });

  if (error) {
    redirect(projectErrorPath(input.projectId, error.message));
  }

  revalidatePath(`/projects/${input.projectId}`);
}

export async function createRunOfShowItemAction(formData: FormData) {
  await requireUser();
  const parsed = runOfShowSchema.safeParse({
    projectId: formData.get("projectId"),
    cueNumber: formData.get("cueNumber"),
    title: formData.get("title"),
    startsAt: formData.get("startsAt"),
    durationMinutes: formData.get("durationMinutes") || undefined
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid run-of-show row.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("run_of_show_items").insert({
    project_id: input.projectId,
    cue_number: input.cueNumber ?? "",
    title: input.title,
    starts_at: datetimeToTimestamp(input.startsAt),
    duration_minutes: input.durationMinutes ?? null
  });

  if (error) {
    redirect(projectErrorPath(input.projectId, error.message));
  }

  revalidatePath(`/projects/${input.projectId}`);
}
