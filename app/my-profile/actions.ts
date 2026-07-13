"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const profileSchema = z.object({
  personId: z.string().uuid(),
  preferredName: z.string().trim().max(120).optional(),
  pronouns: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(40).optional(),
  bio: z.string().trim().max(12000).optional(),
  headshotUrl: z.union([z.string().trim().url("Enter a complete headshot URL."), z.literal("")])
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
    preferredName: optional(formData, "preferredName"),
    pronouns: optional(formData, "pronouns"),
    phone: optional(formData, "phone"),
    bio: optional(formData, "bio"),
    headshotUrl: String(formData.get("headshotUrl") ?? "").trim()
  });
  if (!parsed.success) redirect(`/my-profile?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid profile.")}`);

  const supabase = await createSupabaseServerClient();
  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id, publicity_profile_version, publicity_bio, publicity_headshot_url")
    .eq("id", parsed.data.personId)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (personError || !person) redirect(`/my-profile?error=${encodeURIComponent(personError?.message ?? "Profile not found.")}`);

  const publicityChanged = String(person.publicity_bio ?? "") !== (parsed.data.bio ?? "")
    || String(person.publicity_headshot_url ?? "") !== parsed.data.headshotUrl;
  const { error } = await supabase
    .from("people")
    .update({
      preferred_name: parsed.data.preferredName ?? "",
      pronouns: parsed.data.pronouns ?? "",
      phone: parsed.data.phone ?? "",
      publicity_bio: parsed.data.bio ?? "",
      publicity_headshot_url: parsed.data.headshotUrl,
      publicity_profile_version: Number(person.publicity_profile_version ?? 1) + (publicityChanged ? 1 : 0),
      publicity_profile_updated_at: publicityChanged ? new Date().toISOString() : undefined
    })
    .eq("id", parsed.data.personId)
    .eq("auth_user_id", user.id);
  if (error) redirect(`/my-profile?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/my-profile");
  revalidatePath(`/people/${parsed.data.personId}`);
  redirect("/my-profile?success=Profile%20saved.%20Existing%20production%20snapshots%20were%20not%20changed.");
}

export async function approveMyPublicitySubmissionAction(formData: FormData) {
  const user = await requireUser();
  const submissionId = z.string().uuid().parse(String(formData.get("submissionId") ?? ""));
  const supabase = await createSupabaseServerClient();
  const { data: submission, error: readError } = await supabase
    .from("project_publicity_submissions")
    .select("id, person_id, status")
    .eq("id", submissionId)
    .maybeSingle();
  if (readError || !submission) redirect(`/my-profile?error=${encodeURIComponent(readError?.message ?? "Submission not found.")}`);

  const { data: person } = await supabase.from("people").select("id").eq("id", submission.person_id).eq("auth_user_id", user.id).maybeSingle();
  if (!person) redirect("/my-profile?error=That%20submission%20does%20not%20belong%20to%20you.");
  if (!['awaiting_person_approval', 'changes_requested'].includes(String(submission.status))) {
    redirect("/my-profile?error=This%20production%20copy%20is%20not%20awaiting%20your%20approval.");
  }

  const { error } = await supabase
    .from("project_publicity_submissions")
    .update({
      status: "person_approved",
      person_approved_at: new Date().toISOString(),
      person_approved_by: user.id,
      editorial_approved_at: null,
      editorial_approved_by: null,
      playbill_sync_status: "not_ready",
      playbill_sync_error: ""
    })
    .eq("id", submissionId)
    .eq("person_id", person.id);
  if (error) redirect(`/my-profile?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/my-profile");
  redirect("/my-profile?success=Production%20bio%20and%20headshot%20approved.");
}
