"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  archiveReferenceRecord,
  createDepartment,
  createLocation,
  createReferenceValue
} from "@/lib/reference-data";
import { requireUser } from "@/lib/auth";

const referenceTypeSchema = z.enum(["project_type", "calendar_item_type", "role_group"]);
const archiveKindSchema = z.enum(["department", "location", "reference_value"]);

function settingsErrorPath(message: string) {
  return `/settings/reference-data?error=${encodeURIComponent(message)}`;
}

function requiredString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

export async function createDepartmentAction(formData: FormData) {
  await requireUser();
  const parsed = z.string().trim().min(1, "Department name is required.").max(160).safeParse(requiredString(formData.get("name")));

  if (!parsed.success) {
    redirect(settingsErrorPath(parsed.error.issues[0]?.message ?? "Invalid department."));
  }

  try {
    await createDepartment(parsed.data);
  } catch (error) {
    redirect(settingsErrorPath(error instanceof Error ? error.message : "Could not create department."));
  }

  revalidatePath("/settings/reference-data");
}

export async function createLocationAction(formData: FormData) {
  await requireUser();
  const parsed = z.string().trim().min(1, "Location name is required.").max(160).safeParse(requiredString(formData.get("name")));

  if (!parsed.success) {
    redirect(settingsErrorPath(parsed.error.issues[0]?.message ?? "Invalid location."));
  }

  try {
    await createLocation(parsed.data);
  } catch (error) {
    redirect(settingsErrorPath(error instanceof Error ? error.message : "Could not create location."));
  }

  revalidatePath("/settings/reference-data");
}

export async function createReferenceValueAction(formData: FormData) {
  await requireUser();
  const parsed = z
    .object({
      referenceType: referenceTypeSchema,
      label: z.string().trim().min(1, "Reference value label is required.").max(160)
    })
    .safeParse({
      referenceType: requiredString(formData.get("referenceType")),
      label: requiredString(formData.get("label"))
    });

  if (!parsed.success) {
    redirect(settingsErrorPath(parsed.error.issues[0]?.message ?? "Invalid reference value."));
  }

  try {
    await createReferenceValue(parsed.data.referenceType, parsed.data.label);
  } catch (error) {
    redirect(settingsErrorPath(error instanceof Error ? error.message : "Could not create reference value."));
  }

  revalidatePath("/settings/reference-data");
}

export async function archiveReferenceRecordAction(formData: FormData) {
  await requireUser();
  const parsed = z
    .object({
      kind: archiveKindSchema,
      id: z.string().uuid()
    })
    .safeParse({
      kind: requiredString(formData.get("kind")),
      id: requiredString(formData.get("id"))
    });

  if (!parsed.success) {
    redirect(settingsErrorPath(parsed.error.issues[0]?.message ?? "Invalid reference record."));
  }

  try {
    await archiveReferenceRecord(parsed.data.kind, parsed.data.id);
  } catch (error) {
    redirect(settingsErrorPath(error instanceof Error ? error.message : "Could not archive reference record."));
  }

  revalidatePath("/settings/reference-data");
}
