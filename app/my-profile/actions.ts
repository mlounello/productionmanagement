"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { SITE_URL } from "@/lib/config";

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
  bio: z.string().trim().max(12000).optional()
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
    new_publicity_bio: parsed.data.bio ?? ""
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
