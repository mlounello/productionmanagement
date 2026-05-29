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
  timelineGroupId: z.string().uuid().optional(),
  newTimelineGroupName: z.string().trim().max(120).optional(),
  departmentId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  startsOn: z.string().trim().optional(),
  endsOn: z.string().trim().optional(),
  dueOn: z.string().trim().optional()
});

const projectRoleSchema = z.object({
  projectId: projectIdSchema,
  name: z.string().trim().min(1, "Role name is required.").max(120),
  roleGroup: z.enum(["production_team", "cast", "crew", "designer", "department_head", "staff", "guest_artist"]),
  departmentId: z.string().uuid().optional()
});

const runOfShowSchema = z.object({
  projectId: projectIdSchema,
  cueNumber: z.string().trim().max(40).optional(),
  title: z.string().trim().min(1, "Run-of-show title is required.").max(180),
  itemType: z.enum(["window", "task", "event", "milestone", "deadline", "run_of_show"]),
  timelineGroupId: z.string().uuid().optional(),
  newTimelineGroupName: z.string().trim().max(120).optional(),
  departmentId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  startsAt: z.string().trim().optional(),
  endsAt: z.string().trim().optional(),
  dueAt: z.string().trim().optional(),
  durationMinutes: z.coerce.number().int().min(0).max(24 * 60).optional(),
  runOfShowOrder: z.coerce.number().int().min(0).max(100000).optional(),
  description: z.string().trim().max(2000).optional(),
  runOfShowNotes: z.string().trim().max(2000).optional()
});

const projectScopedRowSchema = z.object({
  projectId: projectIdSchema,
  id: z.string().uuid()
});

const projectLocationSchema = z.object({
  projectId: projectIdSchema,
  locationId: z.string().uuid()
});

const timelineGroupSchema = z.object({
  projectId: projectIdSchema,
  name: z.string().trim().min(1, "Timeline group name is required.").max(120)
});

function requiredString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function optionalString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim() ? value : undefined;
}

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

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 90);
}

async function createProjectTimelineGroup(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  projectId: string,
  name: string
) {
  const slug = slugify(name);
  if (!slug) {
    redirect(projectErrorPath(projectId, "Timeline group name is required."));
  }

  const { data: group, error } = await supabase
    .from("project_timeline_groups")
    .insert({
      project_id: projectId,
      name,
      slug
    })
    .select("id")
    .single();

  if (error || !group) {
    redirect(projectErrorPath(projectId, error?.message ?? "Could not create timeline group."));
  }

  return String(group.id);
}

async function getDepartmentName(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, id?: string) {
  if (!id) {
    return "";
  }

  const { data, error } = await supabase.from("departments").select("name").eq("id", id).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return typeof data?.name === "string" ? data.name : "";
}

async function getLocationName(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, id?: string) {
  if (!id) {
    return "";
  }

  const { data, error } = await supabase.from("locations").select("name").eq("id", id).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return typeof data?.name === "string" ? data.name : "";
}

export async function createCalendarItemAction(formData: FormData) {
  await requireUser();
  const parsed = calendarItemSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    title: requiredString(formData.get("title")),
    itemType: requiredString(formData.get("itemType")),
    timelineGroupId: optionalString(formData.get("timelineGroupId")),
    newTimelineGroupName: optionalString(formData.get("newTimelineGroupName")),
    departmentId: optionalString(formData.get("departmentId")),
    locationId: optionalString(formData.get("locationId")),
    startsOn: optionalString(formData.get("startsOn")),
    endsOn: optionalString(formData.get("endsOn")),
    dueOn: optionalString(formData.get("dueOn"))
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid calendar item.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  let timelineGroupId = input.timelineGroupId ?? null;

  if (input.newTimelineGroupName) {
    timelineGroupId = await createProjectTimelineGroup(supabase, input.projectId, input.newTimelineGroupName);
  }

  let departmentName = "";
  let locationName = "";
  try {
    [departmentName, locationName] = await Promise.all([
      getDepartmentName(supabase, input.departmentId),
      getLocationName(supabase, input.locationId)
    ]);
  } catch (error) {
    redirect(projectErrorPath(input.projectId, error instanceof Error ? error.message : "Could not resolve references."));
  }

  const { error } = await supabase.from("calendar_items").insert({
    project_id: input.projectId,
    title: input.title,
    item_type: input.itemType,
    timeline_group_id: timelineGroupId,
    department_id: input.departmentId ?? null,
    location_id: input.locationId ?? null,
    department: departmentName,
    location: locationName,
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
    projectId: requiredString(formData.get("projectId")),
    name: requiredString(formData.get("name")),
    roleGroup: requiredString(formData.get("roleGroup")),
    departmentId: optionalString(formData.get("departmentId"))
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid project role.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  let departmentName = "";
  try {
    departmentName = await getDepartmentName(supabase, input.departmentId);
  } catch (error) {
    redirect(projectErrorPath(input.projectId, error instanceof Error ? error.message : "Could not resolve department."));
  }

  const { error } = await supabase.from("project_roles").insert({
    project_id: input.projectId,
    name: input.name,
    role_group: input.roleGroup,
    department: departmentName
  });

  if (error) {
    redirect(projectErrorPath(input.projectId, error.message));
  }

  revalidatePath(`/projects/${input.projectId}`);
}

export async function createRunOfShowItemAction(formData: FormData) {
  await requireUser();
  const parsed = runOfShowSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    cueNumber: optionalString(formData.get("cueNumber")),
    title: requiredString(formData.get("title")),
    itemType: requiredString(formData.get("itemType")),
    timelineGroupId: optionalString(formData.get("timelineGroupId")),
    newTimelineGroupName: optionalString(formData.get("newTimelineGroupName")),
    departmentId: optionalString(formData.get("departmentId")),
    locationId: optionalString(formData.get("locationId")),
    startsAt: optionalString(formData.get("startsAt")),
    endsAt: optionalString(formData.get("endsAt")),
    dueAt: optionalString(formData.get("dueAt")),
    durationMinutes: optionalString(formData.get("durationMinutes")),
    runOfShowOrder: optionalString(formData.get("runOfShowOrder")),
    description: optionalString(formData.get("description")),
    runOfShowNotes: optionalString(formData.get("runOfShowNotes"))
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid run-of-show row.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  let timelineGroupId = input.timelineGroupId ?? null;

  if (input.newTimelineGroupName) {
    timelineGroupId = await createProjectTimelineGroup(supabase, input.projectId, input.newTimelineGroupName);
  }

  let departmentName = "";
  let locationName = "";
  try {
    [departmentName, locationName] = await Promise.all([
      getDepartmentName(supabase, input.departmentId),
      getLocationName(supabase, input.locationId)
    ]);
  } catch (error) {
    redirect(projectErrorPath(input.projectId, error instanceof Error ? error.message : "Could not resolve references."));
  }

  const { error } = await supabase.from("calendar_items").insert({
    project_id: input.projectId,
    title: input.title,
    item_type: input.itemType,
    timeline_group_id: timelineGroupId,
    department_id: input.departmentId ?? null,
    location_id: input.locationId ?? null,
    department: departmentName,
    location: locationName,
    starts_at: datetimeToTimestamp(input.startsAt),
    ends_at: datetimeToTimestamp(input.endsAt),
    due_at: datetimeToTimestamp(input.dueAt),
    all_day: false,
    description: input.description ?? "",
    is_run_of_show_relevant: true,
    run_of_show_order: input.runOfShowOrder ?? null,
    cue_number: input.cueNumber ?? "",
    duration_minutes: input.durationMinutes ?? null,
    run_of_show_notes: input.runOfShowNotes ?? ""
  });

  if (error) {
    redirect(projectErrorPath(input.projectId, error.message));
  }

  revalidatePath(`/projects/${input.projectId}`);
}

export async function deleteCalendarItemAction(formData: FormData) {
  await requireUser();
  const parsed = projectScopedRowSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    id: requiredString(formData.get("id"))
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid calendar item.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("calendar_items").delete().eq("project_id", input.projectId).eq("id", input.id);

  if (error) {
    redirect(projectErrorPath(input.projectId, error.message));
  }

  revalidatePath(`/projects/${input.projectId}`);
}

export async function deleteRunOfShowItemAction(formData: FormData) {
  await requireUser();
  const parsed = projectScopedRowSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    id: requiredString(formData.get("id"))
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid run-of-show row.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("calendar_items").delete().eq("project_id", input.projectId).eq("id", input.id);

  if (error) {
    redirect(projectErrorPath(input.projectId, error.message));
  }

  revalidatePath(`/projects/${input.projectId}`);
}

export async function addProjectLocationAction(formData: FormData) {
  await requireUser();
  const parsed = projectLocationSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    locationId: requiredString(formData.get("locationId"))
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid project location.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("project_locations").insert({
    project_id: input.projectId,
    location_id: input.locationId
  });

  if (error) {
    redirect(projectErrorPath(input.projectId, error.message));
  }

  revalidatePath(`/projects/${input.projectId}`);
}

export async function removeProjectLocationAction(formData: FormData) {
  await requireUser();
  const parsed = projectScopedRowSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    id: requiredString(formData.get("id"))
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid project location.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("project_locations").delete().eq("project_id", input.projectId).eq("id", input.id);

  if (error) {
    redirect(projectErrorPath(input.projectId, error.message));
  }

  revalidatePath(`/projects/${input.projectId}`);
}

export async function deleteProjectAction(formData: FormData) {
  await requireUser();
  const parsed = projectIdSchema.safeParse(formData.get("projectId"));

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent("Invalid project.")}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("projects").delete().eq("id", parsed.data);

  if (error) {
    redirect(projectErrorPath(parsed.data, error.message));
  }

  revalidatePath("/projects");
  redirect("/projects");
}

export async function createTimelineGroupAction(formData: FormData) {
  await requireUser();
  const parsed = timelineGroupSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    name: requiredString(formData.get("name"))
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid timeline group.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  await createProjectTimelineGroup(supabase, input.projectId, input.name);

  revalidatePath(`/projects/${input.projectId}`);
}

export async function archiveTimelineGroupAction(formData: FormData) {
  await requireUser();
  const parsed = projectScopedRowSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    id: requiredString(formData.get("id"))
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid timeline group.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("project_timeline_groups")
    .update({ is_active: false })
    .eq("project_id", input.projectId)
    .eq("id", input.id);

  if (error) {
    redirect(projectErrorPath(input.projectId, error.message));
  }

  revalidatePath(`/projects/${input.projectId}`);
}
