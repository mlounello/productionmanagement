"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { publicitySyncFailureStatus, syncApprovedPublicityToPlaybill } from "@/lib/publicity-sync";
import { sendPublicityReminder } from "@/lib/profile-access-links";
import { sanitizeRichText, stripRichTextToPlain } from "@/lib/rich-text";

const uuid = z.string().uuid();
const copySchema = z.object({
  projectId: uuid,
  submissionId: uuid,
  creditedName: z.string().trim().min(1, "Credited name is required.").max(180),
  bio: z.string().trim().max(20000),
  headshotUrl: z.union([z.string().trim().url("Enter a complete headshot URL."), z.literal("")])
});

function path(projectId: string, kind: "error" | "success", message: string) {
  return `/projects/${projectId}/publicity?${kind}=${encodeURIComponent(message)}`;
}

async function requirePublicityManager(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: projectAllowed }, { data: appAllowed }] = await Promise.all([
    supabase.rpc("has_project_role", { target_project_id: projectId, allowed_roles: ["project_manager", "producer", "department_head", "staff"] }),
    supabase.rpc("has_app_role", { allowed_roles: ["admin", "producer"] })
  ]);
  if (!projectAllowed && !appAllowed) throw new Error("You do not have permission to manage publicity for this project.");
}

function values(formData: FormData) {
  return {
    projectId: String(formData.get("projectId") ?? ""),
    submissionId: String(formData.get("submissionId") ?? ""),
    creditedName: String(formData.get("creditedName") ?? ""),
    bio: String(formData.get("bio") ?? ""),
    headshotUrl: String(formData.get("headshotUrl") ?? "").trim()
  };
}

function creditedNameForProfile(person: {
  full_name: string;
  last_name: string;
  preferred_name: string;
}) {
  const preferredName = String(person.preferred_name ?? "").trim();
  const lastName = String(person.last_name ?? "").trim();
  const fullName = String(person.full_name ?? "").trim();
  if (!preferredName) return fullName;
  if (!lastName || preferredName.toLocaleLowerCase().endsWith(lastName.toLocaleLowerCase())) return preferredName;
  return `${preferredName} ${lastName}`;
}

export async function prepareProjectPublicityAction(formData: FormData) {
  await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  const supabase = await createSupabaseServerClient();
  const { data: assignments, error } = await supabase
    .from("role_assignments")
    .select("id, person_id, people(full_name, last_name, preferred_name, publicity_bio, publicity_headshot_url, publicity_profile_version)")
    .eq("project_id", projectId)
    .not("status", "in", "(declined,withdrawn)");
  if (error) redirect(path(projectId, "error", error.message));

  const rowsByPerson = new Map<string, Record<string, unknown>>();
  for (const assignment of assignments ?? []) {
    const person = assignment.people as unknown as { full_name: string; last_name: string; preferred_name: string; publicity_bio: string; publicity_headshot_url: string; publicity_profile_version: number } | null;
    rowsByPerson.set(String(assignment.person_id), {
      project_id: projectId,
      person_id: assignment.person_id,
      credited_name: person ? creditedNameForProfile(person) : "",
      bio: person?.publicity_bio ?? "",
      headshot_url: person?.publicity_headshot_url ?? "",
      source_profile_version: Number(person?.publicity_profile_version ?? 1),
      status: "draft",
      playbill_sync_status: "not_ready"
    });
  }
  const rows = [...rowsByPerson.values()];
  if (rows.length) {
    const { error: upsertError } = await supabase.from("project_publicity_submissions").upsert(rows, { onConflict: "project_id,person_id", ignoreDuplicates: true });
    if (upsertError) redirect(path(projectId, "error", upsertError.message));
  }
  revalidatePath(`/projects/${projectId}/publicity`);
  redirect(path(projectId, "success", `Prepared ${rows.length} assignment${rows.length === 1 ? "" : "s"}. Existing production copies were preserved.`));
}

export async function saveProjectPublicityCopyAction(formData: FormData) {
  await requireUser();
  const parsed = copySchema.safeParse(values(formData));
  if (!parsed.success) {
    const projectId = String(formData.get("projectId") ?? "");
    redirect(path(projectId, "error", parsed.error.issues[0]?.message ?? "Invalid publicity copy."));
  }
  const supabase = await createSupabaseServerClient();
  const cleanBio = sanitizeRichText(parsed.data.bio);
  if (cleanBio.length > 12000) redirect(path(parsed.data.projectId, "error", "This formatted production bio is too long."));
  const [{ data: existing }, { data: publicitySettings }] = await Promise.all([
    supabase.from("project_publicity_submissions").select("playbill_submission_status").eq("id", parsed.data.submissionId).eq("project_id", parsed.data.projectId).maybeSingle(),
    supabase.from("project_publicity_settings").select("bio_character_limit").eq("project_id", parsed.data.projectId).maybeSingle()
  ]);
  if (existing?.playbill_submission_status === "locked") redirect(path(parsed.data.projectId, "error", "This copy is locked in Playbill and is read-only."));
  const bioLimit = Number(publicitySettings?.bio_character_limit ?? 350);
  if (stripRichTextToPlain(cleanBio).length > bioLimit) redirect(path(parsed.data.projectId, "error", `This production limits bios to ${bioLimit} visible characters.`));
  const { error } = await supabase.from("project_publicity_submissions").update({
    credited_name: parsed.data.creditedName,
    bio: cleanBio,
    headshot_url: parsed.data.headshotUrl,
    status: "draft",
    person_approved_at: null,
    person_approved_by: null,
    editorial_approved_at: null,
    editorial_approved_by: null,
    playbill_sync_status: "not_ready",
    playbill_sync_error: ""
  }).eq("id", parsed.data.submissionId).eq("project_id", parsed.data.projectId);
  if (error) redirect(path(parsed.data.projectId, "error", error.message));
  revalidatePath(`/projects/${parsed.data.projectId}/publicity`);
  redirect(path(parsed.data.projectId, "success", "Production copy saved. Prior approvals were cleared because the copy changed."));
}

export async function refreshPublicityFromProfileAction(formData: FormData) {
  await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  const submissionId = uuid.parse(String(formData.get("submissionId") ?? ""));
  const supabase = await createSupabaseServerClient();
  const { data: submission, error } = await supabase.from("project_publicity_submissions").select("person_id").eq("id", submissionId).eq("project_id", projectId).maybeSingle();
  if (error || !submission) redirect(path(projectId, "error", error?.message ?? "Submission not found."));
  const { data: person, error: personError } = await supabase.from("people").select("full_name, last_name, preferred_name, publicity_bio, publicity_headshot_url, publicity_profile_version").eq("id", submission.person_id).maybeSingle();
  if (personError || !person) redirect(path(projectId, "error", personError?.message ?? "Person not found."));
  const { error: updateError } = await supabase.from("project_publicity_submissions").update({
    credited_name: creditedNameForProfile(person),
    bio: person.publicity_bio,
    headshot_url: person.publicity_headshot_url,
    source_profile_version: person.publicity_profile_version,
    status: "draft",
    person_approved_at: null,
    person_approved_by: null,
    editorial_approved_at: null,
    editorial_approved_by: null,
    playbill_sync_status: "not_ready",
    playbill_sync_error: ""
  }).eq("id", submissionId);
  if (updateError) redirect(path(projectId, "error", updateError.message));
  revalidatePath(`/projects/${projectId}/publicity`);
  redirect(path(projectId, "success", "Refreshed from the reusable profile. This production copy must be approved again."));
}

export async function requestPublicityApprovalAction(formData: FormData) {
  await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  const submissionId = uuid.parse(String(formData.get("submissionId") ?? ""));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("project_publicity_submissions").update({ status: "awaiting_person_approval", person_approved_at: null, person_approved_by: null, editorial_approved_at: null, editorial_approved_by: null, playbill_sync_status: "not_ready", playbill_sync_error: "" }).eq("id", submissionId).eq("project_id", projectId);
  if (error) redirect(path(projectId, "error", error.message));
  revalidatePath(`/projects/${projectId}/publicity`);
  redirect(path(projectId, "success", "Approval requested. The person can review it under My Profile."));
}

export async function approveAndSyncPublicityAction(formData: FormData) {
  const user = await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  const submissionId = uuid.parse(String(formData.get("submissionId") ?? ""));
  const supabase = await createSupabaseServerClient();
  const { data: approvedRow, error } = await supabase.from("project_publicity_submissions").update({ status: "approved", editorial_approved_at: new Date().toISOString(), editorial_approved_by: user.id, playbill_sync_status: "pending", playbill_sync_error: "" }).eq("id", submissionId).eq("project_id", projectId).eq("status", "person_approved").select("id").maybeSingle();
  if (error || !approvedRow) redirect(path(projectId, "error", error?.message ?? "The person must approve this production copy first."));
  try {
    await syncApprovedPublicityToPlaybill(submissionId);
  } catch (syncError) {
    const message = syncError instanceof Error ? syncError.message : "Unknown Playbill error.";
    await supabase.from("project_publicity_submissions").update({ playbill_sync_status: publicitySyncFailureStatus(syncError), playbill_sync_error: message }).eq("id", submissionId);
    revalidatePath(`/projects/${projectId}/publicity`);
    redirect(path(projectId, "error", `Production copy approved, but Playbill sync failed: ${message}`));
  }
  revalidatePath(`/projects/${projectId}/publicity`);
  redirect(path(projectId, "success", "Approved production copy sent to Playbill for final editorial review."));
}

export async function retryPublicitySyncAction(formData: FormData) {
  await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  const submissionId = uuid.parse(String(formData.get("submissionId") ?? ""));
  try {
    await syncApprovedPublicityToPlaybill(submissionId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Playbill error.";
    const supabase = await createSupabaseServerClient();
    await supabase.from("project_publicity_submissions").update({ playbill_sync_status: publicitySyncFailureStatus(error), playbill_sync_error: message }).eq("id", submissionId);
    redirect(path(projectId, "error", message));
  }
  revalidatePath(`/projects/${projectId}/publicity`);
  redirect(path(projectId, "success", "Approved copy resynced to Playbill."));
}

export async function savePublicitySettingsAction(formData: FormData) {
  await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  const dateValue = (name: string) => {
    const raw = String(formData.get(name) ?? "").trim();
    return raw || null;
  };
  const supabase = await createSupabaseServerClient();
  const bioLimit = z.coerce.number().int().min(50, "The bio limit must be at least 50 characters.").max(5000, "The bio limit cannot exceed 5,000 characters.")
    .safeParse(formData.get("bioCharacterLimit"));
  if (!bioLimit.success) redirect(path(projectId, "error", bioLimit.error.issues[0]?.message ?? "Enter a valid bio character limit."));
  const { error } = await supabase.from("project_publicity_settings").upsert({
    project_id: projectId,
    bio_due_on: dateValue("bioDueOn"),
    headshot_due_on: dateValue("headshotDueOn"),
    bio_character_limit: bioLimit.data,
    reminders_enabled: formData.get("remindersEnabled") === "on"
  }, { onConflict: "project_id" });
  if (error) redirect(path(projectId, "error", error.message));
  revalidatePath(`/projects/${projectId}/publicity`);
  revalidatePath("/my-profile");
  redirect(path(projectId, "success", "Publicity deadlines and reminder settings saved."));
}

export async function sendPublicityReminderAction(formData: FormData) {
  const user = await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  const personId = uuid.parse(String(formData.get("personId") ?? ""));
  try { await requirePublicityManager(projectId); }
  catch (error) { redirect(path(projectId, "error", error instanceof Error ? error.message : "Permission denied.")); }
  let email = "";
  let failure = "";
  try { email = (await sendPublicityReminder(personId, projectId, user.id)).email; }
  catch (error) { failure = error instanceof Error ? error.message : "Reminder could not be sent."; }
  if (failure) redirect(path(projectId, "error", failure));
  revalidatePath(`/projects/${projectId}/publicity`);
  redirect(path(projectId, "success", `Reminder sent to ${email}.`));
}

export async function sendBulkPublicityRemindersAction(formData: FormData) {
  const user = await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  try { await requirePublicityManager(projectId); }
  catch (error) { redirect(path(projectId, "error", error instanceof Error ? error.message : "Permission denied.")); }
  const personIds = [...new Set(formData.getAll("personId").map(String))].filter((value) => uuid.safeParse(value).success);
  if (!personIds.length) redirect(path(projectId, "error", "Select at least one person."));
  const failures: string[] = [];
  let sent = 0;
  for (const personId of personIds) {
    try {
      await sendPublicityReminder(personId, projectId, user.id);
      sent += 1;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "Unknown reminder error.");
    }
  }
  revalidatePath(`/projects/${projectId}/publicity`);
  if (failures.length) redirect(path(projectId, "error", `${sent} reminder${sent === 1 ? "" : "s"} sent; ${failures.length} failed. ${failures[0]}`));
  redirect(path(projectId, "success", `${sent} reminder${sent === 1 ? "" : "s"} sent.`));
}
