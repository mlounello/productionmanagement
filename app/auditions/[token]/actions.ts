"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const uuid = z.string().uuid();

export async function submitAuditionAction(formData: FormData) {
  const token = uuid.parse(formData.get("formToken"));
  const fields = JSON.parse(String(formData.get("fieldDefinitions") ?? "[]")) as Array<{ field_key: string; field_type: string; required: boolean }>;
  const answers: Record<string, string | string[]> = {};
  const uploads: Array<{ key: string; file: File }> = [];
  for (const field of fields) {
    if (field.field_type === "file") {
      const file = formData.get(field.field_key);
      if (file instanceof File && file.size > 0) uploads.push({ key: field.field_key, file });
      if (field.required && !(file instanceof File && file.size > 0)) redirect(`/auditions/${token}?error=${encodeURIComponent(`${field.field_key} is required.`)}`);
      continue;
    }
    const values = formData.getAll(field.field_key).map(String).filter(Boolean);
    const value = field.field_type === "multiple_choice" || field.field_type === "role_selector" ? values : (values[0] ?? "");
    if (field.required && (!value || (Array.isArray(value) && value.length === 0))) redirect(`/auditions/${token}?error=${encodeURIComponent("Please complete all required questions.")}`);
    answers[field.field_key] = value;
  }
  const slotRaw = String(formData.get("audition_slot") ?? "");
  const slotId = slotRaw ? uuid.parse(slotRaw) : null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_public_audition", { form_token: token, answer_payload: answers, selected_slot_id: slotId });
  if (error || !data) redirect(`/auditions/${token}?error=${encodeURIComponent(error?.message ?? "Could not submit audition form.")}`);
  const result = data as { submission_id: string; access_token: string };
  for (const upload of uploads) {
    if (upload.file.size > 5 * 1024 * 1024) redirect(`/auditions/${token}/confirmation?access=${result.access_token}&warning=${encodeURIComponent(`${upload.file.name} exceeded 5 MB and was not uploaded.`)}`);
    const bytes = Buffer.from(await upload.file.arrayBuffer());
    const { error: uploadError } = await supabase.rpc("upload_public_audition_file", {
      access_token: result.access_token,
      target_field_key: upload.key,
      upload_name: upload.file.name,
      upload_type: upload.file.type || "application/octet-stream",
      upload_data: `\\x${bytes.toString("hex")}`
    });
    if (uploadError) redirect(`/auditions/${token}/confirmation?access=${result.access_token}&warning=${encodeURIComponent(uploadError.message)}`);
  }
  redirect(`/auditions/${token}/confirmation?access=${result.access_token}`);
}

export async function manageAuditionBookingAction(formData: FormData) {
  const token = uuid.parse(formData.get("formToken"));
  const access = uuid.parse(formData.get("accessToken"));
  const action = z.enum(["cancel", "reschedule"]).parse(formData.get("requestedAction"));
  const slotRaw = String(formData.get("slotId") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("manage_public_audition_submission", { access_token: access, requested_action: action, selected_slot_id: slotRaw ? uuid.parse(slotRaw) : null });
  if (error) redirect(`/auditions/${token}/confirmation?access=${access}&error=${encodeURIComponent(error.message)}`);
  redirect(`/auditions/${token}/confirmation?access=${access}&success=${encodeURIComponent(action === "cancel" ? "Audition registration cancelled." : "Audition time updated.")}`);
}
