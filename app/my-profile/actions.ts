"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { SITE_URL } from "@/lib/config";
import { syncApprovedPublicityToPlaybill } from "@/lib/publicity-sync";
import { sanitizeRichText, stripRichTextToPlain } from "@/lib/rich-text";

const profileSchema = z.object({
  personId: z.string().uuid(),
  fullName: z.string().trim().min(1, "Full name is required.").max(180),
  firstName: z.string().trim().max(80).optional(),
  middleName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  preferredName: z.string().trim().max(120).optional(),
  pronouns: z.string().trim().max(80).optional(),
  vendorNumber: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(40).optional(),
  bio: z.string().trim().max(5000).optional()
});

function optional(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  return value || undefined;
}

export async function connectMyProfileAction() {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("claim_my_person_profile");
  if (error) redirect(`/my-profile?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/my-profile");
  redirect("/my-profile?success=Your%20profile%20is%20connected.");
}

export async function updateMyPublicityProfileAction(formData: FormData) {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    personId: String(formData.get("personId") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
    firstName: optional(formData, "firstName"),
    middleName: optional(formData, "middleName"),
    lastName: optional(formData, "lastName"),
    preferredName: optional(formData, "preferredName"),
    pronouns: optional(formData, "pronouns"),
    vendorNumber: optional(formData, "vendorNumber"),
    phone: optional(formData, "phone"),
    bio: optional(formData, "bio")
  });
  if (!parsed.success) redirect(`/my-profile?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid profile.")}`);
  const cleanBio = sanitizeRichText(parsed.data.bio ?? "");
  if (stripRichTextToPlain(cleanBio).length > 350) {
    redirect("/my-profile?error=Your%20reusable%20bio%20must%20be%20350%20visible%20characters%20or%20fewer.");
  }

  const supabase = await createSupabaseServerClient();
  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id")
    .eq("id", parsed.data.personId)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (personError || !person) redirect(`/my-profile?error=${encodeURIComponent(personError?.message ?? "Profile not found.")}`);

  const { error } = await supabase.rpc("update_my_person_profile", {
    new_full_name: parsed.data.fullName,
    new_first_name: parsed.data.firstName ?? "",
    new_middle_name: parsed.data.middleName ?? "",
    new_last_name: parsed.data.lastName ?? "",
    new_preferred_name: parsed.data.preferredName ?? "",
    new_pronouns: parsed.data.pronouns ?? "",
    new_vendor_number: parsed.data.vendorNumber ?? "",
    new_phone: parsed.data.phone ?? "",
    new_publicity_bio: cleanBio
  });
  if (error) redirect(`/my-profile?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/my-profile");
  revalidatePath(`/people/${parsed.data.personId}`);
  redirect("/my-profile?success=Profile%20saved.%20Existing%20production%20snapshots%20were%20not%20changed.");
}

export async function requestMyEmailChangeAction(formData: FormData) {
  await requireUser();
  const parsed = z.string().trim().toLowerCase().email("Enter a valid email.").safeParse(String(formData.get("email") ?? ""));
  if (!parsed.success) redirect(`/my-profile?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Enter a valid email.")}`);
  const email = parsed.data;
  const supabase = await createSupabaseServerClient();
  const next = encodeURIComponent("/my-profile");
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${SITE_URL}/auth/callback?next=${next}` }
  );
  if (error) redirect(`/my-profile?error=${encodeURIComponent(error.message)}`);
  redirect(`/my-profile?success=${encodeURIComponent(`Check ${email} to confirm the change. Your profile email updates only after verification.`)}`);
}

export async function approveMyPublicitySubmissionAction(formData: FormData) {
  const user = await requireUser();
  const submissionId = z.string().uuid().parse(String(formData.get("submissionId") ?? ""));
  const supabase = await createSupabaseServerClient();
  const { data: submission, error: readError } = await supabase
    .from("project_publicity_submissions")
    .select("id, project_id, person_id, status, bio")
    .eq("id", submissionId)
    .maybeSingle();
  if (readError || !submission) redirect(`/my-profile?error=${encodeURIComponent(readError?.message ?? "Submission not found.")}`);

  const { data: person } = await supabase.from("people").select("id").eq("id", submission.person_id).eq("auth_user_id", user.id).maybeSingle();
  if (!person) redirect("/my-profile?error=That%20submission%20does%20not%20belong%20to%20you.");
  if (!['draft', 'awaiting_person_approval', 'changes_requested'].includes(String(submission.status))) {
    redirect("/my-profile?error=This%20production%20copy%20is%20not%20awaiting%20your%20approval.");
  }
  const { data: publicitySettings } = await supabase.from("project_publicity_settings")
    .select("bio_character_limit").eq("project_id", submission.project_id).maybeSingle();
  const bioLimit = Number(publicitySettings?.bio_character_limit ?? 350);
  if (stripRichTextToPlain(String(submission.bio ?? "")).length > bioLimit) {
    redirect(`/my-profile?error=${encodeURIComponent(`Shorten this show-specific bio to ${bioLimit} characters before approving it.`)}`);
  }

  const { error } = await supabase.rpc("approve_my_project_publicity", { target_submission_id: submissionId });
  if (error) redirect(`/my-profile?error=${encodeURIComponent(error.message)}`);

  let syncWarning = "";
  try {
    await syncApprovedPublicityToPlaybill(submissionId);
  } catch (syncError) {
    syncWarning = syncError instanceof Error ? syncError.message : "Unknown Playbill sync error.";
    await supabase.from("project_publicity_submissions").update({
      playbill_sync_status: "failed", playbill_sync_error: syncWarning
    }).eq("id", submissionId);
  }

  revalidatePath("/my-profile");
  revalidatePath(`/projects/${submission.project_id}/publicity`);
  if (syncWarning) {
    redirect(`/my-profile?error=${encodeURIComponent(`Your copy was approved, but Playbill could not receive it yet: ${syncWarning}`)}`);
  }
  redirect("/my-profile?success=Approved%20and%20submitted%20to%20Playbill%20for%20editorial%20review.");
}

export async function updateMyProjectPublicityBioAction(formData: FormData) {
  await requireUser();
  const submissionId = z.string().uuid().parse(String(formData.get("submissionId") ?? ""));
  const rawBio = z.string().trim().max(20000, "This production bio is too long.").parse(String(formData.get("bio") ?? ""));
  const bio = sanitizeRichText(rawBio);
  if (bio.length > 12000) redirect("/my-profile?error=This%20formatted%20production%20bio%20is%20too%20long.");
  const supabase = await createSupabaseServerClient();
  const { data: before, error: readError } = await supabase.from("project_publicity_submissions")
    .select("id, project_id, status, playbill_submission_status")
    .eq("id", submissionId)
    .maybeSingle();
  if (readError || !before) redirect(`/my-profile?error=${encodeURIComponent(readError?.message ?? "Production publicity record not found.")}`);
  if (before.playbill_submission_status === "locked") redirect("/my-profile?error=This%20Playbill%20submission%20is%20locked.");
  const { data: publicitySettings } = await supabase.from("project_publicity_settings")
    .select("bio_character_limit").eq("project_id", before.project_id).maybeSingle();
  const bioLimit = Number(publicitySettings?.bio_character_limit ?? 350);
  if (stripRichTextToPlain(bio).length > bioLimit) {
    redirect(`/my-profile?error=${encodeURIComponent(`This production limits bios to ${bioLimit} visible characters.`)}`);
  }

  const { error } = await supabase.rpc("update_my_project_publicity_bio", {
    target_submission_id: submissionId,
    new_bio: bio
  });
  if (error) redirect(`/my-profile?error=${encodeURIComponent(error.message)}`);

  let message = "Show-specific bio saved.";
  if (["person_approved", "approved"].includes(String(before.status))) {
    try {
      await syncApprovedPublicityToPlaybill(submissionId);
      message = "Show-specific bio saved and resubmitted to Playbill.";
    } catch (syncError) {
      const warning = syncError instanceof Error ? syncError.message : "Unknown Playbill sync error.";
      await supabase.from("project_publicity_submissions").update({ playbill_sync_status: "failed", playbill_sync_error: warning }).eq("id", submissionId);
      redirect(`/my-profile?error=${encodeURIComponent(`Bio saved, but Playbill sync failed: ${warning}`)}`);
    }
  }
  revalidatePath("/my-profile");
  revalidatePath(`/projects/${before.project_id}/publicity`);
  redirect(`/my-profile?success=${encodeURIComponent(message)}`);
}
