"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { syncPersonAssignmentsToPlaybill } from "@/lib/playbill-sync";

const personIdSchema = z.string().uuid();

const personProfileSchema = z.object({
  id: personIdSchema,
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  preferredName: z.string().trim().max(120).optional(),
  fullName: z.string().trim().min(1, "Person name is required.").max(180),
  email: z.string().trim().email("Enter a valid email.").optional(),
  vendorNumber: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(40).optional(),
  pronouns: z.string().trim().max(80).optional(),
  affiliation: z.string().trim().max(160).optional(),
  personType: z.enum(["student", "staff", "faculty", "guest_artist", "vendor_contact", "client", "person"]),
  status: z.enum(["active", "inactive", "archived"]),
  notes: z.string().trim().max(4000).optional(),
  publicityBio: z.string().trim().max(12000).optional(),
  publicityHeadshotUrl: z.union([z.string().trim().url("Enter a complete headshot URL."), z.literal("")])
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

function peopleErrorPath(personId: string, message: string) {
  return `/people/${personId}?error=${encodeURIComponent(message)}`;
}

function peopleSuccessPath(personId: string, message: string) {
  return `/people/${personId}?success=${encodeURIComponent(message)}`;
}

export async function updatePersonProfileAction(formData: FormData) {
  await requireUser();
  const parsed = personProfileSchema.safeParse({
    id: requiredString(formData.get("id")),
    firstName: optionalString(formData.get("firstName")),
    lastName: optionalString(formData.get("lastName")),
    preferredName: optionalString(formData.get("preferredName")),
    fullName: requiredString(formData.get("fullName")),
    email: optionalString(formData.get("email")),
    vendorNumber: optionalString(formData.get("vendorNumber")),
    phone: optionalString(formData.get("phone")),
    pronouns: optionalString(formData.get("pronouns")),
    affiliation: optionalString(formData.get("affiliation")),
    personType: optionalString(formData.get("personType")) ?? "person",
    status: optionalString(formData.get("status")) ?? "active",
    notes: optionalString(formData.get("notes")),
    publicityBio: optionalString(formData.get("publicityBio")),
    publicityHeadshotUrl: requiredString(formData.get("publicityHeadshotUrl")).trim()
  });

  if (!parsed.success) {
    const fallbackId = requiredString(formData.get("id"));
    redirect(`/people${fallbackId ? `/${fallbackId}` : ""}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid person profile.")}`);
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data: current } = await supabase.from("people").select("publicity_profile_version, publicity_bio, publicity_headshot_url").eq("id", input.id).maybeSingle();
  const publicityChanged = String(current?.publicity_bio ?? "") !== (input.publicityBio ?? "")
    || String(current?.publicity_headshot_url ?? "") !== input.publicityHeadshotUrl;
  const { error } = await supabase
    .from("people")
    .update({
      first_name: input.firstName ?? "",
      last_name: input.lastName ?? "",
      preferred_name: input.preferredName ?? "",
      full_name: input.fullName,
      email: input.email ?? "",
      vendor_number: input.vendorNumber ?? "",
      phone: input.phone ?? "",
      pronouns: input.pronouns ?? "",
      affiliation: input.affiliation ?? "",
      person_type: input.personType,
      status: input.status,
      notes: input.notes ?? "",
      publicity_bio: input.publicityBio ?? "",
      publicity_headshot_url: input.publicityHeadshotUrl,
      publicity_profile_version: Number(current?.publicity_profile_version ?? 1) + (publicityChanged ? 1 : 0),
      publicity_profile_updated_at: publicityChanged ? new Date().toISOString() : undefined
    })
    .eq("id", input.id);

  if (error) {
    redirect(peopleErrorPath(input.id, error.message));
  }

  try {
    await syncPersonAssignmentsToPlaybill(input.id);
  } catch (syncError) {
    redirect(peopleErrorPath(input.id, `Profile saved, but Playbill sync failed: ${syncError instanceof Error ? syncError.message : "Unknown error"}`));
  }

  revalidatePath("/people");
  revalidatePath(`/people/${input.id}`);
  redirect(peopleSuccessPath(input.id, "Profile saved."));
}
