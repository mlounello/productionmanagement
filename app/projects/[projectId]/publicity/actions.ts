"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { syncApprovedPublicityToPlaybill } from "@/lib/publicity-sync";

const uuid = z.string().uuid();
const copySchema = z.object({
  projectId: uuid,
  submissionId: uuid,
  creditedName: z.string().trim().min(1, "Credited name is required.").max(180),
  bio: z.string().trim().max(12000),
  headshotUrl: z.union([z.string().trim().url("Enter a complete headshot URL."), z.literal("")])
});

function path(projectId: string, kind: "error" | "success", message: string) {
  return `/projects/${projectId}/publicity?${kind}=${encodeURIComponent(message)}`;
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

export async function prepareProjectPublicityAction(formData: FormData) {
  await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  const supabase = await createSupabaseServerClient();
  const { data: assignments, error } = await supabase
    .from("role_assignments")
    .select("id, person_id, people(full_name, preferred_name, publicity_bio, publicity_headshot_url, publicity_profile_version)")
    .eq("project_id", projectId)
    .not("status", "in", "(declined,withdrawn)");
  if (error) redirect(path(projectId, "error", error.message));

  const rowsByPerson = new Map<string, Record<string, unknown>>();
  for (const assignment of assignments ?? []) {
    const person = assignment.people as unknown as { full_name: string; preferred_name: string; publicity_bio: string; publicity_headshot_url: string; publicity_profile_version: number } | null;
    rowsByPerson.set(String(assignment.person_id), {
      project_id: projectId,
      person_id: assignment.person_id,
      credited_name: person?.preferred_name || person?.full_name || "",
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
  const { error } = await supabase.from("project_publicity_submissions").update({
    credited_name: parsed.data.creditedName,
    bio: parsed.data.bio,
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
  const { data: person, error: personError } = await supabase.from("people").select("full_name, preferred_name, publicity_bio, publicity_headshot_url, publicity_profile_version").eq("id", submission.person_id).maybeSingle();
  if (personError || !person) redirect(path(projectId, "error", personError?.message ?? "Person not found."));
  const { error: updateError } = await supabase.from("project_publicity_submissions").update({
    credited_name: person.preferred_name || person.full_name,
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
    await supabase.from("project_publicity_submissions").update({ playbill_sync_status: "failed", playbill_sync_error: message }).eq("id", submissionId);
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
    await supabase.from("project_publicity_submissions").update({ playbill_sync_status: "failed", playbill_sync_error: message }).eq("id", submissionId);
    redirect(path(projectId, "error", message));
  }
  revalidatePath(`/projects/${projectId}/publicity`);
  redirect(path(projectId, "success", "Approved copy resynced to Playbill."));
}
