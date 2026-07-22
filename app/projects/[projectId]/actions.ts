"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assignExistingBudgetGuestArtistToRole } from "@/lib/budget-role-assignment";
import { removeAssignmentGoogleAutomation } from "@/lib/google-group-automation";
import { beginAssignmentOnboarding } from "@/lib/role-acceptance";
import { ENABLE_BUDGET_WRITES, ENABLE_PLAYBILL_WRITES } from "@/lib/config";
import { fetchPlaybillShowById } from "@/lib/playbill";
import {
  markAssignmentPlaybillSyncFailed,
  markProjectRolePlaybillSyncFailed,
  syncAssignmentToPlaybill,
  syncProjectRoleToPlaybill,
  vacateAssignmentInPlaybill
} from "@/lib/playbill-sync";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  createTheatreBudgetGuestArtist,
  fetchTheatreBudgetGuestArtistById,
  fetchTheatreBudgetProjectById,
  findTheatreBudgetGuestArtist
} from "@/lib/theatre-budget";
import { projectWorkspacePath, type ProjectWorkspaceKey } from "@/lib/project-routes";

const projectIdSchema = z.string().uuid();
const assignmentKindSchema = z.enum(["primary", "shared", "understudy", "alternate"]);
const supportedRoleGroups = new Set([
  "creative_team", "production_team", "cast", "directorial_team", "administrative",
  "front_of_house", "music_band", "crew", "designer", "department_head", "staff", "guest_artist"
]);

const calendarItemSchema = z.object({
  projectId: projectIdSchema,
  title: z.string().trim().min(1, "Calendar title is required.").max(180),
  itemType: z.enum(["window", "task", "event", "milestone", "deadline", "run_of_show"]),
  timelineGroupId: z.string().uuid().optional(),
  newTimelineGroupName: z.string().trim().max(120).optional(),
  departmentId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  status: z.enum(["planned", "in_progress", "blocked", "completed", "cancelled"]),
  startsOn: z.string().trim().optional(),
  endsOn: z.string().trim().optional(),
  dueOn: z.string().trim().optional(),
  startsAt: z.string().trim().optional(),
  endsAt: z.string().trim().optional(),
  dueAt: z.string().trim().optional(),
  allDay: z.boolean(),
  description: z.string().trim().max(2000).optional(),
  includeRunOfShow: z.boolean(),
  cueNumber: z.string().trim().max(40).optional(),
  durationMinutes: z.coerce.number().int().min(0).max(24 * 60).optional(),
  runOfShowOrder: z.coerce.number().int().min(0).max(100000).optional(),
  runOfShowNotes: z.string().trim().max(2000).optional()
});

const calendarItemUpdateSchema = calendarItemSchema.extend({
  id: z.string().uuid()
});

const projectRoleSchema = z.object({
  projectId: projectIdSchema,
  name: z.string().trim().min(1, "Role name is required.").max(120),
  roleGroup: z.enum([
    "creative_team",
    "production_team",
    "cast",
    "directorial_team",
    "administrative",
    "front_of_house",
    "music_band"
  ]),
  departmentId: z.string().uuid().optional()
});

const projectRoleUpdateSchema = z.object({
  id: z.string().uuid(),
  projectId: projectIdSchema,
  name: z.string().trim().min(1, "Role name is required.").max(120),
  roleGroup: z.enum([
    "creative_team",
    "production_team",
    "cast",
    "directorial_team",
    "administrative",
    "front_of_house",
    "music_band",
    "crew",
    "designer",
    "department_head",
    "staff",
    "guest_artist"
  ]),
  departmentId: z.string().uuid().optional(),
  existingDepartment: z.string().trim().max(120).optional()
});

const personSchema = z.object({
  projectId: projectIdSchema,
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  preferredName: z.string().trim().max(120).optional(),
  fullName: z.string().trim().min(1, "Person name is required.").max(180),
  email: z.string().trim().email("Enter a valid email.").optional(),
  vendorNumber: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(40).optional(),
  pronouns: z.string().trim().max(80).optional(),
  affiliation: z.string().trim().max(160).optional(),
  personType: z.enum(["student", "staff", "faculty", "guest_artist", "vendor_contact", "client", "person"])
});

const roleAssignmentSchema = z.object({
  projectId: projectIdSchema,
  roleId: z.string().uuid(),
  personId: z.string().uuid(),
  status: z.enum(["draft", "offered", "accepted", "declined", "withdrawn"]),
  confirmationStatus: z.enum(["not_sent", "sent", "accepted", "declined", "bounced"]),
  assignmentKind: z.enum(["primary", "shared", "understudy", "alternate"]),
  isGuestArtist: z.boolean(),
  notes: z.string().trim().max(2000).optional()
});

const personNoteSchema = z.object({
  projectId: projectIdSchema,
  personId: z.string().uuid(),
  visibility: z.enum(["internal", "client_visible"]),
  note: z.string().trim().min(1, "Note is required.").max(4000),
  isPinned: z.boolean()
});

const guestArtistLinkSchema = z.object({
  projectId: projectIdSchema,
  assignmentId: z.string().uuid(),
  guestArtistId: z.string().uuid()
});

const assignBudgetGuestArtistSchema = z.object({
  projectId: projectIdSchema,
  roleId: z.string().uuid(),
  guestArtistId: z.string().uuid(),
  assignmentKind: assignmentKindSchema
});

const bulkRegularAssignmentRowSchema = z.object({
  roleId: z.string().uuid(),
  personId: z.string().uuid(),
  assignmentKind: assignmentKindSchema,
  isGuestArtist: z.boolean()
});

const bulkBudgetAssignmentRowSchema = z.object({
  roleId: z.string().uuid(),
  guestArtistId: z.string().uuid(),
  assignmentKind: assignmentKindSchema
});

const playbillShowLinkSchema = z.object({
  projectId: projectIdSchema,
  showId: z.string().uuid()
});

const theatreBudgetProjectLinkSchema = z.object({
  projectId: projectIdSchema,
  budgetProjectId: z.string().uuid()
});

const playbillAssignmentSyncSchema = z.object({
  projectId: projectIdSchema,
  assignmentId: z.string().uuid()
});

const playbillProjectRoleSyncSchema = z.object({
  projectId: projectIdSchema,
  roleId: z.string().uuid()
});

const bulkRoleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  roleGroup: z.string().trim().min(1).max(80),
  department: z.string().trim().max(120).optional()
});

const replaceAssignmentSchema = z.object({
  projectId: projectIdSchema,
  assignmentId: z.string().uuid(),
  newPersonId: z.string().uuid()
});

const createBudgetGuestArtistSchema = z.object({
  projectId: projectIdSchema,
  assignmentId: z.string().uuid(),
  confirmCreate: z.literal("on")
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

function timestampFromInput(datetimeValue?: string, dateValue?: string) {
  return datetimeToTimestamp(datetimeValue) ?? dateToTimestamp(dateValue);
}

function projectErrorPath(projectId: string, message: string, workspace?: ProjectWorkspaceKey) {
  return projectWorkspacePath(projectId, workspace, { error: message });
}

function projectSuccessPath(projectId: string, message: string, workspace?: ProjectWorkspaceKey) {
  return projectWorkspacePath(projectId, workspace, { success: message });
}

function projectAssignmentErrorPath(projectId: string, message: string) {
  return `${projectErrorPath(projectId, message, "roles")}#assignments`;
}

function projectAssignmentSuccessPath(projectId: string, message: string) {
  return `${projectSuccessPath(projectId, message, "roles")}#assignments`;
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

function calendarItemInputFromFormData(formData: FormData) {
  return {
    projectId: requiredString(formData.get("projectId")),
    title: requiredString(formData.get("title")),
    itemType: requiredString(formData.get("itemType")),
    timelineGroupId: optionalString(formData.get("timelineGroupId")),
    newTimelineGroupName: optionalString(formData.get("newTimelineGroupName")),
    departmentId: optionalString(formData.get("departmentId")),
    locationId: optionalString(formData.get("locationId")),
    status: optionalString(formData.get("status")) ?? "planned",
    startsOn: optionalString(formData.get("startsOn")),
    endsOn: optionalString(formData.get("endsOn")),
    dueOn: optionalString(formData.get("dueOn")),
    startsAt: optionalString(formData.get("startsAt")),
    endsAt: optionalString(formData.get("endsAt")),
    dueAt: optionalString(formData.get("dueAt")),
    allDay: formData.get("allDay") === "on",
    description: optionalString(formData.get("description")),
    includeRunOfShow: formData.get("includeRunOfShow") === "on",
    cueNumber: optionalString(formData.get("cueNumber")),
    durationMinutes: optionalString(formData.get("durationMinutes")),
    runOfShowOrder: optionalString(formData.get("runOfShowOrder")),
    runOfShowNotes: optionalString(formData.get("runOfShowNotes"))
  };
}

async function buildCalendarItemPayload(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  input: z.infer<typeof calendarItemSchema>
) {
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

  return {
    project_id: input.projectId,
    title: input.title,
    item_type: input.itemType,
    status: input.status,
    timeline_group_id: timelineGroupId,
    department_id: input.departmentId ?? null,
    location_id: input.locationId ?? null,
    department: departmentName,
    location: locationName,
    starts_at: timestampFromInput(input.startsAt, input.startsOn),
    ends_at: timestampFromInput(input.endsAt, input.endsOn),
    due_at: timestampFromInput(input.dueAt, input.dueOn),
    all_day: input.allDay,
    description: input.description ?? "",
    is_run_of_show_relevant: input.includeRunOfShow,
    run_of_show_order: input.includeRunOfShow ? input.runOfShowOrder ?? null : null,
    cue_number: input.includeRunOfShow ? input.cueNumber ?? "" : "",
    duration_minutes: input.includeRunOfShow ? input.durationMinutes ?? null : null,
    run_of_show_notes: input.includeRunOfShow ? input.runOfShowNotes ?? "" : ""
  };
}

export async function createCalendarItemAction(formData: FormData) {
  await requireUser();
  const parsed = calendarItemSchema.safeParse(calendarItemInputFromFormData(formData));

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid calendar item.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const payload = await buildCalendarItemPayload(supabase, input);
  const { error } = await supabase.from("calendar_items").insert(payload);

  if (error) {
    redirect(projectErrorPath(input.projectId, error.message, "calendar"));
  }

  revalidatePath(`/projects/${input.projectId}`);
}

export async function updateCalendarItemAction(formData: FormData) {
  await requireUser();
  const parsed = calendarItemUpdateSchema.safeParse({
    id: requiredString(formData.get("id")),
    ...calendarItemInputFromFormData(formData)
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid calendar item.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const payload = await buildCalendarItemPayload(supabase, input);
  const { error } = await supabase
    .from("calendar_items")
    .update(payload)
    .eq("project_id", input.projectId)
    .eq("id", input.id);

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
    if (input.departmentId) {
      departmentName = await getDepartmentName(supabase, input.departmentId);
    }
  } catch (error) {
    redirect(projectErrorPath(input.projectId, error instanceof Error ? error.message : "Could not resolve department."));
  }

  const { data: createdRole, error } = await supabase.from("project_roles").insert({
    project_id: input.projectId,
    name: input.name,
    role_group: input.roleGroup,
    department: departmentName
  }).select("id").single();

  if (error) {
    redirect(projectErrorPath(input.projectId, error.message));
  }

  try {
    await syncProjectRoleToPlaybill(input.projectId, String(createdRole.id));
  } catch (syncError) {
    await markProjectRolePlaybillSyncFailed(input.projectId, String(createdRole.id), syncError);
    redirect(projectErrorPath(input.projectId, `Role created, but Playbill sync failed: ${syncError instanceof Error ? syncError.message : "Unknown error"}`));
  }
  revalidatePath(`/projects/${input.projectId}`);
  redirect(projectSuccessPath(input.projectId, "Role created and synced to the linked draft Playbill show when available.", "roles"));
}

export async function bulkCreateProjectRolesAction(formData: FormData) {
  await requireUser();
  const projectId = projectIdSchema.safeParse(requiredString(formData.get("projectId")));
  if (!projectId.success) redirect(`/projects?error=${encodeURIComponent("Invalid project.")}`);
  let decoded: unknown;
  try {
    decoded = JSON.parse(requiredString(formData.get("rolesJson")) || "[]");
  } catch {
    redirect(projectErrorPath(projectId.data, "Could not read the pasted role list."));
  }
  const parsed = z.array(bulkRoleSchema).max(500).safeParse(decoded);
  if (!parsed.success) redirect(projectErrorPath(projectId.data, "One or more bulk roles are invalid."));
  const requested = parsed.data.filter((role) => supportedRoleGroups.has(role.roleGroup));
  if (!requested.length) redirect(projectErrorPath(projectId.data, "No valid new roles were provided."));

  const supabase = await createSupabaseServerClient();
  const { data: existing, error: existingError } = await supabase
    .from("project_roles")
    .select("name, role_group")
    .eq("project_id", projectId.data);
  if (existingError) redirect(projectErrorPath(projectId.data, existingError.message));
  const keys = new Set((existing ?? []).map((role) => `${String(role.name).trim().toLowerCase()}|${role.role_group}`));
  const rows: Array<{ project_id: string; name: string; role_group: string; department: string }> = [];
  for (const role of requested) {
    const key = `${role.name.toLowerCase()}|${role.roleGroup}`;
    if (keys.has(key)) continue;
    keys.add(key);
    rows.push({ project_id: projectId.data, name: role.name, role_group: role.roleGroup, department: role.department ?? "" });
  }
  if (!rows.length) redirect(projectSuccessPath(projectId.data, "Every pasted role already exists."));
  const { data: created, error } = await supabase.from("project_roles").insert(rows).select("id");
  if (error) redirect(projectErrorPath(projectId.data, error.message));

  let failed = 0;
  for (const role of created ?? []) {
    try {
      await syncProjectRoleToPlaybill(projectId.data, String(role.id));
    } catch (syncError) {
      failed += 1;
      await markProjectRolePlaybillSyncFailed(projectId.data, String(role.id), syncError);
    }
  }
  revalidatePath(`/projects/${projectId.data}`);
  redirect(projectSuccessPath(projectId.data, `${created?.length ?? 0} roles created${failed ? `; ${failed} need Playbill retry` : " and synced when linked"}.`, "roles"));
}

export async function copyProjectRolesAction(formData: FormData) {
  await requireUser();
  const parsed = z.object({ projectId: projectIdSchema, sourceProjectId: projectIdSchema }).safeParse({
    projectId: requiredString(formData.get("projectId")),
    sourceProjectId: requiredString(formData.get("sourceProjectId"))
  });
  if (!parsed.success) redirect(`/projects?error=${encodeURIComponent("Choose a source project.")}`);
  if (parsed.data.projectId === parsed.data.sourceProjectId) redirect(projectErrorPath(parsed.data.projectId, "Choose a different project."));
  const supabase = await createSupabaseServerClient();
  const [{ data: source, error: sourceError }, { data: existing, error: existingError }] = await Promise.all([
    supabase.from("project_roles").select("name, role_group, department, description, sort_order").eq("project_id", parsed.data.sourceProjectId),
    supabase.from("project_roles").select("name, role_group").eq("project_id", parsed.data.projectId)
  ]);
  if (sourceError) redirect(projectErrorPath(parsed.data.projectId, sourceError.message));
  if (existingError) redirect(projectErrorPath(parsed.data.projectId, existingError.message));
  const keys = new Set((existing ?? []).map((role) => `${String(role.name).trim().toLowerCase()}|${role.role_group}`));
  const rows = (source ?? [])
    .filter((role) => !keys.has(`${String(role.name).trim().toLowerCase()}|${role.role_group}`))
    .map((role) => ({ ...role, project_id: parsed.data.projectId }));
  if (!rows.length) redirect(projectSuccessPath(parsed.data.projectId, "No new roles to copy."));
  const { data: created, error } = await supabase.from("project_roles").insert(rows).select("id");
  if (error) redirect(projectErrorPath(parsed.data.projectId, error.message));
  for (const role of created ?? []) {
    try {
      await syncProjectRoleToPlaybill(parsed.data.projectId, String(role.id));
    } catch (syncError) {
      await markProjectRolePlaybillSyncFailed(parsed.data.projectId, String(role.id), syncError);
    }
  }
  revalidatePath(`/projects/${parsed.data.projectId}`);
  redirect(projectSuccessPath(parsed.data.projectId, `${created?.length ?? 0} roles copied and queued for integration.`, "roles"));
}

export async function updateProjectRoleAction(formData: FormData) {
  await requireUser();
  const parsed = projectRoleUpdateSchema.safeParse({
    id: requiredString(formData.get("id")),
    projectId: requiredString(formData.get("projectId")),
    name: requiredString(formData.get("name")),
    roleGroup: requiredString(formData.get("roleGroup")),
    departmentId: optionalString(formData.get("departmentId")),
    existingDepartment: optionalString(formData.get("existingDepartment"))
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid project role.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  let departmentName = input.existingDepartment ?? "";
  try {
    if (input.departmentId) {
      departmentName = await getDepartmentName(supabase, input.departmentId);
    }
  } catch (error) {
    redirect(projectErrorPath(input.projectId, error instanceof Error ? error.message : "Could not resolve department."));
  }

  const { error } = await supabase
    .from("project_roles")
    .update({
      name: input.name,
      role_group: input.roleGroup,
      department: departmentName
    })
    .eq("project_id", input.projectId)
    .eq("id", input.id);

  if (error) {
    redirect(projectErrorPath(input.projectId, error.message));
  }

  try {
    await syncProjectRoleToPlaybill(input.projectId, input.id);
  } catch (syncError) {
    await markProjectRolePlaybillSyncFailed(input.projectId, input.id, syncError);
    redirect(projectErrorPath(input.projectId, `Role saved, but Playbill sync failed: ${syncError instanceof Error ? syncError.message : "Unknown error"}`));
  }

  revalidatePath(`/projects/${input.projectId}`);
  redirect(projectSuccessPath(input.projectId, "Role saved.", "roles"));
}

export async function createPersonAction(formData: FormData) {
  await requireUser();
  const parsed = personSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    firstName: optionalString(formData.get("firstName")),
    lastName: optionalString(formData.get("lastName")),
    preferredName: optionalString(formData.get("preferredName")),
    fullName: requiredString(formData.get("fullName")),
    email: optionalString(formData.get("email")),
    vendorNumber: optionalString(formData.get("vendorNumber")),
    phone: optionalString(formData.get("phone")),
    pronouns: optionalString(formData.get("pronouns")),
    affiliation: optionalString(formData.get("affiliation")),
    personType: optionalString(formData.get("personType")) ?? "person"
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid person.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("people").insert({
    first_name: input.firstName ?? "",
    last_name: input.lastName ?? "",
    preferred_name: input.preferredName ?? "",
    full_name: input.fullName,
    email: input.email ?? "",
    vendor_number: input.vendorNumber ?? "",
    phone: input.phone ?? "",
    pronouns: input.pronouns ?? "",
    affiliation: input.affiliation ?? "",
    person_type: input.personType
  });

  if (error) {
    redirect(projectErrorPath(input.projectId, error.message));
  }

  revalidatePath(`/projects/${input.projectId}`);
}

export async function createRoleAssignmentAction(formData: FormData) {
  const user = await requireUser();
  const parsed = roleAssignmentSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    roleId: requiredString(formData.get("roleId")),
    personId: requiredString(formData.get("personId")),
    status: optionalString(formData.get("status")) ?? "draft",
    confirmationStatus: optionalString(formData.get("confirmationStatus")) ?? "not_sent",
    assignmentKind: optionalString(formData.get("assignmentKind")) ?? "primary",
    isGuestArtist: formData.get("isGuestArtist") === "on",
    notes: optionalString(formData.get("notes"))
  });

  if (!parsed.success) {
    redirect(projectAssignmentErrorPath(requiredString(formData.get("projectId")), parsed.error.issues[0]?.message ?? "Invalid role assignment."));
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data: existingRoleAssignments, error: roleAvailabilityError } = await supabase
    .from("role_assignments")
    .select("id, status")
    .eq("project_id", input.projectId)
    .eq("role_id", input.roleId);
  if (roleAvailabilityError) redirect(projectAssignmentErrorPath(input.projectId, roleAvailabilityError.message));
  if ((existingRoleAssignments ?? []).some((assignment) => !["declined", "withdrawn"].includes(String(assignment.status)))) {
    redirect(projectAssignmentErrorPath(input.projectId, "That role is already filled. Choose another role."));
  }
  const { data: createdAssignment, error } = await supabase.from("role_assignments").insert({
    project_id: input.projectId,
    role_id: input.roleId,
    person_id: input.personId,
    status: input.status,
    confirmation_status: input.confirmationStatus,
    assignment_kind: input.assignmentKind,
    is_guest_artist: input.isGuestArtist,
    guest_artist_sync_status: input.isGuestArtist ? "not_ready" : "not_guest_artist",
    playbill_sync_status: "not_ready",
    notes: input.notes ?? ""
  }).select("id").single();

  if (error) {
    redirect(projectAssignmentErrorPath(input.projectId, error.message));
  }

  let googleWarning = "";
  let deferPlaybill = false;
  try {
    const result = await beginAssignmentOnboarding(input.projectId, String(createdAssignment.id), user.id);
    googleWarning = result.warnings.join(" ");
    deferPlaybill = result.deferPlaybill;
  } catch (automationError) {
    googleWarning = automationError instanceof Error ? automationError.message : "Google Group automation could not run.";
  }

  if (!deferPlaybill) try {
    await syncAssignmentToPlaybill(input.projectId, String(createdAssignment.id));
  } catch (syncError) {
    await markAssignmentPlaybillSyncFailed(input.projectId, String(createdAssignment.id), syncError);
    redirect(projectAssignmentErrorPath(input.projectId, `Assignment saved, but Playbill sync failed: ${syncError instanceof Error ? syncError.message : "Unknown error"}`));
  }
  revalidatePath(`/projects/${input.projectId}`);
  const assignmentMessage = deferPlaybill
    ? "Assignment saved. Student onboarding will continue after role acceptance."
    : "Assignment saved and synced to Playbill when linked.";
  redirect(projectAssignmentSuccessPath(input.projectId, googleWarning
    ? `${assignmentMessage} Onboarding needs attention: ${googleWarning}`
    : assignmentMessage));
}

export async function assignTheatreBudgetGuestArtistToRoleAction(formData: FormData) {
  await requireUser();
  const parsed = assignBudgetGuestArtistSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    roleId: requiredString(formData.get("roleId")),
    guestArtistId: requiredString(formData.get("guestArtistId")),
    assignmentKind: optionalString(formData.get("assignmentKind")) ?? "primary"
  });
  if (!parsed.success) redirect(projectAssignmentErrorPath(requiredString(formData.get("projectId")), "Choose a project role and Theatre Budget guest artist."));
  try {
    const result = await assignExistingBudgetGuestArtistToRole(parsed.data);
    revalidatePath(`/projects/${parsed.data.projectId}`);
    revalidatePath("/people");
    const googleNote = result.googleWarnings.length ? " Google automation needs attention." : "";
    redirect(projectAssignmentSuccessPath(parsed.data.projectId, (result.playbillError
      ? `${result.guestArtist.display_name} assigned and Budget-linked; Playbill needs retry.`
      : `${result.guestArtist.display_name} assigned from Theatre Budget and synced to Playbill when linked.`) + googleNote));
  } catch (error) {
    redirect(projectAssignmentErrorPath(parsed.data.projectId, error instanceof Error ? error.message : "Could not assign the Theatre Budget guest artist."));
  }
}

export async function bulkAssignTheatreBudgetGuestArtistsAction(formData: FormData) {
  await requireUser();
  const projectId = projectIdSchema.safeParse(requiredString(formData.get("projectId")));
  if (!projectId.success) redirect(`/projects?error=${encodeURIComponent("Invalid project.")}`);
  let decoded: unknown;
  try {
    decoded = JSON.parse(requiredString(formData.get("rowsJson")) || "[]");
  } catch {
    redirect(projectAssignmentErrorPath(projectId.data, "Could not read the guest-artist assignment rows."));
  }
  const rows = z.array(bulkBudgetAssignmentRowSchema).min(1).max(100).safeParse(decoded);
  if (!rows.success) redirect(projectAssignmentErrorPath(projectId.data, "Complete every Theatre Budget assignment row."));
  let assigned = 0;
  let failed = 0;
  let playbillRetries = 0;
  let googleWarnings = 0;
  for (const row of rows.data) {
    try {
      const result = await assignExistingBudgetGuestArtistToRole({ projectId: projectId.data, ...row });
      assigned += 1;
      if (result.playbillError) playbillRetries += 1;
      if (result.googleWarnings.length) googleWarnings += 1;
    } catch {
      failed += 1;
    }
  }
  revalidatePath(`/projects/${projectId.data}`);
  revalidatePath("/people");
  redirect(projectAssignmentSuccessPath(projectId.data, `${assigned} Budget guest artist assignment${assigned === 1 ? "" : "s"} saved${failed ? `; ${failed} failed` : ""}${playbillRetries ? `; ${playbillRetries} need Playbill retry` : ""}${googleWarnings ? `; ${googleWarnings} need Google automation review` : ""}.`));
}

export async function bulkCreateRoleAssignmentsAction(formData: FormData) {
  const user = await requireUser();
  const projectId = projectIdSchema.safeParse(requiredString(formData.get("projectId")));
  if (!projectId.success) redirect(`/projects?error=${encodeURIComponent("Invalid project.")}`);
  let decoded: unknown;
  try {
    decoded = JSON.parse(requiredString(formData.get("rowsJson")) || "[]");
  } catch {
    redirect(projectAssignmentErrorPath(projectId.data, "Could not read the assignment rows."));
  }
  const rows = z.array(bulkRegularAssignmentRowSchema).min(1).max(100).safeParse(decoded);
  if (!rows.success) redirect(projectAssignmentErrorPath(projectId.data, "Complete every role assignment row."));
  const supabase = await createSupabaseServerClient();
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let playbillRetries = 0;
  let googleWarnings = 0;
  const seen = new Set<string>();
  for (const row of rows.data) {
    const key = `${row.roleId}|${row.personId}`;
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    const { data: existing, error: lookupError } = await supabase
      .from("role_assignments")
      .select("id, person_id, status")
      .eq("project_id", projectId.data)
      .eq("role_id", row.roleId);
    if (lookupError) {
      failed += 1;
      continue;
    }
    if ((existing ?? []).some((assignment) => !["declined", "withdrawn"].includes(String(assignment.status)))) {
      skipped += 1;
      continue;
    }
    const revivable = (existing ?? []).find((assignment) => String(assignment.person_id) === row.personId);
    let assignmentId = "";
    const assignmentValues = {
        status: "draft",
        confirmation_status: "not_sent",
        assignment_kind: row.assignmentKind,
        is_guest_artist: row.isGuestArtist,
        guest_artist_sync_status: row.isGuestArtist ? "not_ready" : "not_guest_artist",
        playbill_sync_status: "not_ready",
        notes: ""
    };
    if (revivable) {
      const { error } = await supabase.from("role_assignments").update(assignmentValues).eq("id", String(revivable.id));
      if (error) {
        failed += 1;
        continue;
      }
      assignmentId = String(revivable.id);
    } else {
      const { data: assignment, error } = await supabase
        .from("role_assignments")
        .insert({ project_id: projectId.data, role_id: row.roleId, person_id: row.personId, ...assignmentValues })
        .select("id")
        .single();
      if (error) {
        failed += 1;
        continue;
      }
      assignmentId = String(assignment.id);
    }
    created += 1;
    let deferPlaybill = false;
    try {
      const result = await beginAssignmentOnboarding(projectId.data, assignmentId, user.id);
      if (result.warnings.length) googleWarnings += 1;
      deferPlaybill = result.deferPlaybill;
    } catch {
      googleWarnings += 1;
    }
    if (!deferPlaybill) try {
      await syncAssignmentToPlaybill(projectId.data, assignmentId);
    } catch (syncError) {
      playbillRetries += 1;
      await markAssignmentPlaybillSyncFailed(projectId.data, assignmentId, syncError);
    }
  }
  revalidatePath(`/projects/${projectId.data}`);
  redirect(projectAssignmentSuccessPath(projectId.data, `${created} assignment${created === 1 ? "" : "s"} created${skipped ? `; ${skipped} duplicate${skipped === 1 ? "" : "s"} skipped` : ""}${failed ? `; ${failed} failed` : ""}${playbillRetries ? `; ${playbillRetries} need Playbill retry` : ""}${googleWarnings ? `; ${googleWarnings} need Google automation review` : ""}.`));
}

export async function updateRoleAssignmentAction(formData: FormData) {
  await requireUser();
  const parsed = roleAssignmentSchema.extend({ id: z.string().uuid() }).safeParse({
    id: requiredString(formData.get("id")),
    projectId: requiredString(formData.get("projectId")),
    roleId: requiredString(formData.get("roleId")),
    personId: requiredString(formData.get("personId")),
    status: optionalString(formData.get("status")) ?? "draft",
    confirmationStatus: optionalString(formData.get("confirmationStatus")) ?? "not_sent",
    assignmentKind: optionalString(formData.get("assignmentKind")) ?? "primary",
    isGuestArtist: formData.get("isGuestArtist") === "on",
    notes: optionalString(formData.get("notes"))
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid role assignment.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  if (!input.isGuestArtist) {
    const { error: unlinkError } = await supabase
      .from("external_links")
      .delete()
      .match({
        local_entity_type: "role_assignment",
        local_entity_id: input.id,
        external_app: "theatre_budget",
        external_schema: "app_theatre_budget",
        external_table: "guest_artists"
      });

    if (unlinkError) {
      redirect(projectErrorPath(input.projectId, unlinkError.message));
    }
  }

  const { error } = await supabase
    .from("role_assignments")
    .update({
      status: input.status,
      confirmation_status: input.confirmationStatus,
      assignment_kind: input.assignmentKind,
      is_guest_artist: input.isGuestArtist,
      guest_artist_sync_status: input.isGuestArtist ? "not_ready" : "not_guest_artist",
      notes: input.notes ?? ""
    })
    .eq("project_id", input.projectId)
    .eq("id", input.id)
    .eq("role_id", input.roleId)
    .eq("person_id", input.personId);

  if (error) {
    redirect(projectErrorPath(input.projectId, error.message));
  }

  try {
    await syncAssignmentToPlaybill(input.projectId, input.id);
  } catch (syncError) {
    await markAssignmentPlaybillSyncFailed(input.projectId, input.id, syncError);
    redirect(projectErrorPath(input.projectId, `Assignment saved, but Playbill sync failed: ${syncError instanceof Error ? syncError.message : "Unknown error"}`));
  }

  revalidatePath(`/projects/${input.projectId}`);
  redirect(projectAssignmentSuccessPath(input.projectId, "Assignment saved."));
}

export async function deleteRoleAssignmentAction(formData: FormData) {
  const user = await requireUser();
  const parsed = projectScopedRowSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    id: requiredString(formData.get("id"))
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid role assignment.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  try {
    await vacateAssignmentInPlaybill(input.projectId, input.id);
  } catch (syncError) {
    redirect(projectErrorPath(input.projectId, `Could not vacate the linked Playbill role: ${syncError instanceof Error ? syncError.message : "Unknown error"}`));
  }
  let googleWarning = "";
  try {
    const result = await removeAssignmentGoogleAutomation(input.projectId, input.id, user.id);
    googleWarning = result.warnings.join(" ");
  } catch (automationError) {
    googleWarning = automationError instanceof Error ? automationError.message : "Google Group removal could not run.";
  }
  const { error } = await supabase.from("role_assignments").delete().eq("project_id", input.projectId).eq("id", input.id);

  if (error) {
    redirect(projectErrorPath(input.projectId, error.message));
  }

  revalidatePath(`/projects/${input.projectId}`);
  redirect(projectAssignmentSuccessPath(input.projectId, googleWarning
    ? `Assignment removed and the linked Playbill role is vacant. Google automation needs attention: ${googleWarning}`
    : "Assignment removed and the linked Playbill role is vacant."));
}

export async function addPersonNoteAction(formData: FormData) {
  const user = await requireUser();
  const parsed = personNoteSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    personId: requiredString(formData.get("personId")),
    visibility: optionalString(formData.get("visibility")) ?? "internal",
    note: requiredString(formData.get("note")),
    isPinned: formData.get("isPinned") === "on"
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid person note.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("person_notes").insert({
    person_id: input.personId,
    project_id: input.projectId,
    visibility: input.visibility,
    note: input.note,
    is_pinned: input.isPinned,
    created_by: user.id
  });

  if (error) {
    redirect(projectErrorPath(input.projectId, error.message, "people"));
  }

  revalidatePath(`/projects/${input.projectId}`);
  redirect(projectSuccessPath(input.projectId, "Person note added.", "people"));
}

export async function linkTheatreBudgetGuestArtistAction(formData: FormData) {
  await requireUser();
  const parsed = guestArtistLinkSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    assignmentId: requiredString(formData.get("assignmentId")),
    guestArtistId: requiredString(formData.get("guestArtistId"))
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid guest artist link.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data: assignment, error: assignmentError } = await supabase
    .from("role_assignments")
    .select("id, is_guest_artist")
    .eq("project_id", input.projectId)
    .eq("id", input.assignmentId)
    .maybeSingle();

  if (assignmentError) {
    redirect(projectErrorPath(input.projectId, assignmentError.message));
  }

  if (!assignment?.id || !assignment.is_guest_artist) {
    redirect(projectErrorPath(input.projectId, "Only guest artist assignments can be linked to Theatre Budget."));
  }

  let guestArtist;
  try {
    guestArtist = await fetchTheatreBudgetGuestArtistById(input.guestArtistId);
  } catch (error) {
    redirect(
      projectErrorPath(
        input.projectId,
        error instanceof Error ? error.message : "Could not read Theatre Budget guest artist."
      )
    );
  }

  if (!guestArtist) {
    redirect(projectErrorPath(input.projectId, "The selected Theatre Budget guest artist was not found."));
  }

  const linkFilter = {
    local_entity_type: "role_assignment",
    local_entity_id: input.assignmentId,
    external_app: "theatre_budget",
    external_schema: "app_theatre_budget",
    external_table: "guest_artists"
  };

  const { error: deleteExistingError } = await supabase
    .from("external_links")
    .delete()
    .match(linkFilter);

  if (deleteExistingError) {
    redirect(projectErrorPath(input.projectId, deleteExistingError.message));
  }

  const { error: linkError } = await supabase.from("external_links").insert({
    ...linkFilter,
    external_id: input.guestArtistId,
    sync_direction: "read_only",
    sync_status: "linked",
    metadata: {
      display_name: guestArtist.display_name,
      email: guestArtist.email,
      active: guestArtist.active,
      linked_from: "production_management_role_assignment"
    }
  });

  if (linkError) {
    redirect(projectErrorPath(input.projectId, linkError.message));
  }

  const { error: assignmentUpdateError } = await supabase
    .from("role_assignments")
    .update({ guest_artist_sync_status: "synced" })
    .eq("project_id", input.projectId)
    .eq("id", input.assignmentId);

  if (assignmentUpdateError) {
    redirect(projectErrorPath(input.projectId, assignmentUpdateError.message));
  }

  revalidatePath(`/projects/${input.projectId}`);
  redirect(projectAssignmentSuccessPath(input.projectId, "Theatre Budget guest artist linked."));
}

export async function unlinkTheatreBudgetGuestArtistAction(formData: FormData) {
  await requireUser();
  const parsed = projectScopedRowSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    id: requiredString(formData.get("assignmentId"))
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid guest artist link.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error: linkError } = await supabase
    .from("external_links")
    .delete()
    .match({
      local_entity_type: "role_assignment",
      local_entity_id: input.id,
      external_app: "theatre_budget",
      external_schema: "app_theatre_budget",
      external_table: "guest_artists"
    });

  if (linkError) {
    redirect(projectErrorPath(input.projectId, linkError.message));
  }

  const { error: assignmentUpdateError } = await supabase
    .from("role_assignments")
    .update({ guest_artist_sync_status: "not_ready" })
    .eq("project_id", input.projectId)
    .eq("id", input.id)
    .eq("is_guest_artist", true);

  if (assignmentUpdateError) {
    redirect(projectErrorPath(input.projectId, assignmentUpdateError.message));
  }

  revalidatePath(`/projects/${input.projectId}`);
  redirect(projectAssignmentSuccessPath(input.projectId, "Theatre Budget guest artist unlinked."));
}

export async function createAndLinkTheatreBudgetGuestArtistAction(formData: FormData) {
  await requireUser();
  const parsed = createBudgetGuestArtistSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    assignmentId: requiredString(formData.get("assignmentId")),
    confirmCreate: formData.get("confirmCreate")
  });
  if (!parsed.success) redirect(`/projects?error=${encodeURIComponent("Confirm the deliberate Theatre Budget guest-artist creation.")}`);
  if (!ENABLE_BUDGET_WRITES) redirect(projectErrorPath(parsed.data.projectId, "Theatre Budget writes are disabled."));
  const supabase = await createSupabaseServerClient();
  const { data: assignment, error: assignmentError } = await supabase
    .from("role_assignments")
    .select("id, person_id, is_guest_artist")
    .eq("project_id", parsed.data.projectId)
    .eq("id", parsed.data.assignmentId)
    .maybeSingle();
  if (assignmentError) redirect(projectErrorPath(parsed.data.projectId, assignmentError.message));
  if (!assignment?.is_guest_artist) redirect(projectErrorPath(parsed.data.projectId, "Only guest-artist assignments can create Budget profiles."));
  const { data: person, error: personError } = await supabase
    .from("people")
    .select("full_name, email, phone, vendor_number")
    .eq("id", String(assignment.person_id))
    .maybeSingle();
  if (personError) redirect(projectErrorPath(parsed.data.projectId, personError.message));
  if (!person) redirect(projectErrorPath(parsed.data.projectId, "Assigned person not found."));

  let duplicate;
  try {
    duplicate = await findTheatreBudgetGuestArtist({
      displayName: String(person.full_name),
      email: String(person.email ?? ""),
      vendorNumber: String(person.vendor_number ?? "")
    });
  } catch (error) {
    redirect(projectErrorPath(parsed.data.projectId, error instanceof Error ? error.message : "Could not search Theatre Budget."));
  }
  if (duplicate) redirect(projectErrorPath(parsed.data.projectId, `A Theatre Budget guest artist already matches ${duplicate.display_name}. Link the existing record instead.`));
  let created;
  try {
    created = await createTheatreBudgetGuestArtist({
      displayName: String(person.full_name),
      email: String(person.email ?? ""),
      phone: String(person.phone ?? ""),
      vendorNumber: String(person.vendor_number ?? "")
    });
  } catch (error) {
    redirect(projectErrorPath(parsed.data.projectId, error instanceof Error ? error.message : "Could not create the Theatre Budget guest artist."));
  }
  const match = {
    local_entity_type: "role_assignment",
    local_entity_id: parsed.data.assignmentId,
    external_app: "theatre_budget",
    external_schema: "app_theatre_budget",
    external_table: "guest_artists"
  };
  const { error: deleteError } = await supabase.from("external_links").delete().match(match);
  if (deleteError) redirect(projectErrorPath(parsed.data.projectId, deleteError.message));
  const { error: linkError } = await supabase.from("external_links").insert({
    ...match,
    external_id: created.id,
    sync_direction: "push",
    sync_status: "synced",
    metadata: { display_name: created.display_name, email: created.email, active: true, created_from: "production_management_confirmed_flow" }
  });
  if (linkError) redirect(projectErrorPath(parsed.data.projectId, linkError.message));
  const { error: statusError } = await supabase
    .from("role_assignments")
    .update({ guest_artist_sync_status: "synced" })
    .eq("id", parsed.data.assignmentId);
  if (statusError) redirect(projectErrorPath(parsed.data.projectId, statusError.message));
  revalidatePath(`/projects/${parsed.data.projectId}`);
  redirect(projectAssignmentSuccessPath(parsed.data.projectId, "Theatre Budget guest artist created and linked. Complete financial details in Theatre Budget."));
}

export async function replaceRoleAssignmentPersonAction(formData: FormData) {
  const user = await requireUser();
  const parsed = replaceAssignmentSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    assignmentId: requiredString(formData.get("assignmentId")),
    newPersonId: requiredString(formData.get("newPersonId"))
  });
  if (!parsed.success) redirect(`/projects?error=${encodeURIComponent("Choose a valid replacement person.")}`);
  const supabase = await createSupabaseServerClient();
  const { data: assignment, error: assignmentError } = await supabase
    .from("role_assignments")
    .select("id, role_id, person_id, is_guest_artist")
    .eq("project_id", parsed.data.projectId)
    .eq("id", parsed.data.assignmentId)
    .maybeSingle();
  if (assignmentError) redirect(projectErrorPath(parsed.data.projectId, assignmentError.message));
  if (!assignment) redirect(projectErrorPath(parsed.data.projectId, "Assignment not found."));
  if (String(assignment.person_id) === parsed.data.newPersonId) redirect(projectAssignmentSuccessPath(parsed.data.projectId, "That person already fills this assignment."));
  const { data: duplicateAssignment, error: duplicateError } = await supabase
    .from("role_assignments")
    .select("id")
    .eq("role_id", String(assignment.role_id))
    .eq("person_id", parsed.data.newPersonId)
    .neq("id", parsed.data.assignmentId)
    .maybeSingle();
  if (duplicateError) redirect(projectErrorPath(parsed.data.projectId, duplicateError.message));
  if (duplicateAssignment) redirect(projectErrorPath(parsed.data.projectId, "That person already has an assignment for this role."));
  try {
    await vacateAssignmentInPlaybill(parsed.data.projectId, parsed.data.assignmentId, true);
  } catch (error) {
    redirect(projectErrorPath(parsed.data.projectId, error instanceof Error ? error.message : "Could not vacate the Playbill role."));
  }
  let googleWarning = "";
  try {
    const result = await removeAssignmentGoogleAutomation(parsed.data.projectId, parsed.data.assignmentId, user.id);
    googleWarning = result.warnings.join(" ");
  } catch (automationError) {
    googleWarning = automationError instanceof Error ? automationError.message : "The prior Google Group membership could not be checked.";
  }
  const { error: unlinkBudgetError } = await supabase
    .from("external_links")
    .delete()
    .eq("local_entity_type", "role_assignment")
    .eq("local_entity_id", parsed.data.assignmentId)
    .eq("external_app", "theatre_budget");
  if (unlinkBudgetError) redirect(projectErrorPath(parsed.data.projectId, unlinkBudgetError.message));
  const { error: updateError } = await supabase
    .from("role_assignments")
    .update({
      person_id: parsed.data.newPersonId,
      playbill_sync_status: "pending",
      guest_artist_sync_status: assignment.is_guest_artist ? "not_ready" : "not_guest_artist"
    })
    .eq("project_id", parsed.data.projectId)
    .eq("id", parsed.data.assignmentId);
  if (updateError) redirect(projectErrorPath(parsed.data.projectId, updateError.message));
  let deferPlaybill = false;
  try {
    const result = await beginAssignmentOnboarding(parsed.data.projectId, parsed.data.assignmentId, user.id);
    googleWarning = [googleWarning, ...result.warnings].filter(Boolean).join(" ");
    deferPlaybill = result.deferPlaybill;
  } catch (automationError) {
    googleWarning = [googleWarning, automationError instanceof Error ? automationError.message : "Google Group automation could not run."].filter(Boolean).join(" ");
  }
  if (!deferPlaybill) try {
    await syncAssignmentToPlaybill(parsed.data.projectId, parsed.data.assignmentId);
  } catch (error) {
    await markAssignmentPlaybillSyncFailed(parsed.data.projectId, parsed.data.assignmentId, error);
    redirect(projectErrorPath(parsed.data.projectId, `Replacement saved, but Playbill sync failed: ${error instanceof Error ? error.message : "Unknown error"}`));
  }
  revalidatePath(`/projects/${parsed.data.projectId}`);
  const replacementMessage = deferPlaybill
    ? "Replacement assigned. Student onboarding and Playbill sync will continue after role acceptance."
    : "Replacement assigned to the existing Playbill role. Review the Budget link if this is a guest artist.";
  redirect(projectAssignmentSuccessPath(parsed.data.projectId, googleWarning
    ? `${replacementMessage} Onboarding needs attention: ${googleWarning}`
    : replacementMessage));
}

export async function linkPlaybillShowAction(formData: FormData) {
  await requireUser();
  const parsed = playbillShowLinkSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    showId: requiredString(formData.get("showId"))
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid Playbill link.")}`);
  }

  const input = parsed.data;
  let show;
  try {
    show = await fetchPlaybillShowById(input.showId);
  } catch (error) {
    redirect(projectErrorPath(input.projectId, error instanceof Error ? error.message : "Could not read Playbill show."));
  }

  if (!show) {
    redirect(projectErrorPath(input.projectId, "The selected Playbill show was not found."));
  }

  const supabase = await createSupabaseServerClient();
  const linkFilter = {
    local_entity_type: "project",
    local_entity_id: input.projectId,
    external_app: "playbill",
    external_schema: "app_playbill",
    external_table: "shows"
  };

  const { error: deleteExistingError } = await supabase.from("external_links").delete().match(linkFilter);

  if (deleteExistingError) {
    redirect(projectErrorPath(input.projectId, deleteExistingError.message));
  }

  const { error: linkError } = await supabase.from("external_links").insert({
    ...linkFilter,
    external_id: input.showId,
    sync_direction: "read_only",
    sync_status: "linked",
    metadata: {
      title: show.title,
      slug: show.slug,
      status: show.status,
      program_id: show.program_id,
      program_title: show.programs?.title ?? null,
      linked_from: "production_management_project"
    }
  });

  if (linkError) {
    redirect(projectErrorPath(input.projectId, linkError.message));
  }

  if (ENABLE_PLAYBILL_WRITES && !show.is_published && show.status === "draft") {
    const { data: roles, error: rolesError } = await supabase
      .from("project_roles")
      .select("id")
      .eq("project_id", input.projectId);
    if (rolesError) {
      redirect(projectErrorPath(input.projectId, rolesError.message));
    }
    try {
      for (const role of roles ?? []) {
        await syncProjectRoleToPlaybill(input.projectId, String(role.id));
      }
      const { data: assignments, error: assignmentsError } = await supabase
        .from("role_assignments")
        .select("id")
        .eq("project_id", input.projectId);
      if (assignmentsError) throw new Error(assignmentsError.message);
      for (const assignment of assignments ?? []) {
        await syncAssignmentToPlaybill(input.projectId, String(assignment.id));
      }
    } catch (syncError) {
      redirect(projectErrorPath(input.projectId, `Show linked, but existing roles or assignments could not be pushed: ${syncError instanceof Error ? syncError.message : "Unknown error"}`));
    }
  }

  revalidatePath(`/projects/${input.projectId}`);
  redirect(projectSuccessPath(input.projectId, "Playbill show linked and existing roles pushed when writes are enabled."));
}

export async function linkTheatreBudgetProjectAction(formData: FormData) {
  await requireUser();
  const parsed = theatreBudgetProjectLinkSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    budgetProjectId: requiredString(formData.get("budgetProjectId"))
  });
  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid Theatre Budget project link.")}`);
  }

  let budgetProject;
  try {
    budgetProject = await fetchTheatreBudgetProjectById(parsed.data.budgetProjectId);
  } catch (error) {
    redirect(projectErrorPath(parsed.data.projectId, error instanceof Error ? error.message : "Could not read the Theatre Budget project."));
  }
  if (!budgetProject) redirect(projectErrorPath(parsed.data.projectId, "The selected Theatre Budget project was not found."));

  const supabase = await createSupabaseServerClient();
  const linkFilter = {
    local_entity_type: "project",
    local_entity_id: parsed.data.projectId,
    external_app: "theatre_budget",
    external_schema: "app_theatre_budget",
    external_table: "projects"
  };
  const { error } = await supabase.from("external_links").upsert({
    ...linkFilter,
    external_id: parsed.data.budgetProjectId,
    sync_direction: "read_only",
    sync_status: "linked",
    metadata: {
      name: budgetProject.name,
      season: budgetProject.season,
      status: budgetProject.status,
      linked_from: "production_management_project"
    }
  }, {
    onConflict: "local_entity_type,local_entity_id,external_app,external_schema,external_table,external_id"
  });
  if (error) redirect(projectErrorPath(parsed.data.projectId, error.message));

  const { error: cleanupError } = await supabase
    .from("external_links")
    .delete()
    .match(linkFilter)
    .neq("external_id", parsed.data.budgetProjectId);
  if (cleanupError) redirect(projectErrorPath(parsed.data.projectId, `New Theatre Budget link saved, but the previous link needs cleanup: ${cleanupError.message}`));

  revalidatePath(`/projects/${parsed.data.projectId}`);
  redirect(projectSuccessPath(parsed.data.projectId, "Theatre Budget project linked. Eligible project-specific access will reconcile when the Production integration gate is enabled."));
}

export async function unlinkTheatreBudgetProjectAction(formData: FormData) {
  await requireUser();
  const parsed = projectIdSchema.safeParse(requiredString(formData.get("projectId")));
  if (!parsed.success) redirect(`/projects?error=${encodeURIComponent("Invalid Theatre Budget project link.")}`);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("external_links").delete().match({
    local_entity_type: "project",
    local_entity_id: parsed.data,
    external_app: "theatre_budget",
    external_schema: "app_theatre_budget",
    external_table: "projects"
  });
  if (error) redirect(projectErrorPath(parsed.data, error.message));

  revalidatePath(`/projects/${parsed.data}`);
  redirect(projectSuccessPath(parsed.data, "Theatre Budget project unlinked. Integration-managed access is revoked when the Production integration gate is enabled."));
}

export async function unlinkPlaybillShowAction(formData: FormData) {
  await requireUser();
  const parsed = projectIdSchema.safeParse(formData.get("projectId"));

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent("Invalid Playbill link.")}`);
  }

  const projectId = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("external_links")
    .delete()
    .match({
      local_entity_type: "project",
      local_entity_id: projectId,
      external_app: "playbill",
      external_schema: "app_playbill",
      external_table: "shows"
    });

  if (error) {
    redirect(projectErrorPath(projectId, error.message));
  }

  const [{ data: roles }, { data: assignments }] = await Promise.all([
    supabase.from("project_roles").select("id").eq("project_id", projectId),
    supabase.from("role_assignments").select("id").eq("project_id", projectId)
  ]);
  const roleIds = (roles ?? []).map((row) => String(row.id));
  const assignmentIds = (assignments ?? []).map((row) => String(row.id));
  if (roleIds.length) {
    const { error: roleLinkError } = await supabase
      .from("external_links")
      .delete()
      .eq("local_entity_type", "project_role")
      .eq("external_app", "playbill")
      .in("local_entity_id", roleIds);
    if (roleLinkError) redirect(projectErrorPath(projectId, roleLinkError.message));
    await supabase.from("project_roles").update({ playbill_sync_status: "not_ready", sync_notes: "" }).in("id", roleIds);
  }
  if (assignmentIds.length) {
    const { error: assignmentLinkError } = await supabase
      .from("external_links")
      .delete()
      .eq("local_entity_type", "role_assignment")
      .eq("external_app", "playbill")
      .in("local_entity_id", assignmentIds);
    if (assignmentLinkError) redirect(projectErrorPath(projectId, assignmentLinkError.message));
    await supabase.from("role_assignments").update({ playbill_sync_status: "not_ready", sync_notes: "" }).in("id", assignmentIds);
  }

  revalidatePath(`/projects/${projectId}`);
  redirect(projectSuccessPath(projectId, "Playbill show unlinked."));
}

export async function syncProjectRoleToPlaybillAction(formData: FormData) {
  await requireUser();
  const parsed = playbillProjectRoleSyncSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    roleId: requiredString(formData.get("roleId"))
  });
  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid Playbill role sync.")}`);
  }
  if (!ENABLE_PLAYBILL_WRITES) {
    redirect(projectErrorPath(parsed.data.projectId, "Playbill writes are disabled."));
  }
  try {
    const result = await syncProjectRoleToPlaybill(parsed.data.projectId, parsed.data.roleId);
    if (!result) redirect(projectErrorPath(parsed.data.projectId, "Link this project to a draft Playbill show first."));
  } catch (error) {
    await markProjectRolePlaybillSyncFailed(parsed.data.projectId, parsed.data.roleId, error);
    redirect(projectErrorPath(parsed.data.projectId, error instanceof Error ? error.message : "Could not sync the Playbill role."));
  }
  revalidatePath(`/projects/${parsed.data.projectId}`);
  redirect(projectSuccessPath(parsed.data.projectId, "Vacant role synced to Playbill."));
}

export async function syncAllProjectIntegrationsAction(formData: FormData) {
  await requireUser();
  const parsed = projectIdSchema.safeParse(requiredString(formData.get("projectId")));
  if (!parsed.success) redirect(`/projects?error=${encodeURIComponent("Invalid project integration sync.")}`);
  const supabase = await createSupabaseServerClient();
  const [{ data: roles, error: rolesError }, { data: assignments, error: assignmentsError }] = await Promise.all([
    supabase.from("project_roles").select("id").eq("project_id", parsed.data),
    supabase.from("role_assignments").select("id, is_guest_artist").eq("project_id", parsed.data)
  ]);
  if (rolesError) redirect(projectErrorPath(parsed.data, rolesError.message));
  if (assignmentsError) redirect(projectErrorPath(parsed.data, assignmentsError.message));
  let roleFailures = 0;
  let assignmentFailures = 0;
  for (const role of roles ?? []) {
    try {
      await syncProjectRoleToPlaybill(parsed.data, String(role.id));
    } catch (error) {
      roleFailures += 1;
      await markProjectRolePlaybillSyncFailed(parsed.data, String(role.id), error);
    }
  }
  for (const assignment of assignments ?? []) {
    try {
      await syncAssignmentToPlaybill(parsed.data, String(assignment.id));
    } catch (error) {
      assignmentFailures += 1;
      await markAssignmentPlaybillSyncFailed(parsed.data, String(assignment.id), error);
    }
  }
  revalidatePath(`/projects/${parsed.data}`);
  const failures = roleFailures + assignmentFailures;
  redirect(projectSuccessPath(parsed.data, failures
    ? `Integration reconciliation finished with ${failures} item${failures === 1 ? "" : "s"} needing retry.`
    : `Reconciled ${roles?.length ?? 0} roles and ${assignments?.length ?? 0} assignments.`));
}

export async function syncRoleAssignmentToPlaybillAction(formData: FormData) {
  await requireUser();
  const parsed = playbillAssignmentSyncSchema.safeParse({
    projectId: requiredString(formData.get("projectId")),
    assignmentId: requiredString(formData.get("assignmentId"))
  });

  if (!parsed.success) {
    redirect(`/projects?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid Playbill sync.")}`);
  }

  const input = parsed.data;
  if (!ENABLE_PLAYBILL_WRITES) {
    redirect(projectErrorPath(input.projectId, "Playbill writes are disabled. Set ENABLE_PLAYBILL_WRITES=true to sync draft Playbill shows."));
  }

  try {
    const result = await syncAssignmentToPlaybill(input.projectId, input.assignmentId);
    if (!result) redirect(projectErrorPath(input.projectId, "Link this project to a draft Playbill show before syncing assignments."));
  } catch (error) {
    await markAssignmentPlaybillSyncFailed(input.projectId, input.assignmentId, error);
    redirect(projectErrorPath(input.projectId, error instanceof Error ? error.message : "Could not sync this assignment to Playbill."));
  }
  revalidatePath(`/projects/${input.projectId}`);
  redirect(projectAssignmentSuccessPath(input.projectId, "Assignment synced to its Playbill role."));

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
