"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { syncAuditionCalendarSlots } from "@/lib/audition-calendar-sync";

const uuid = z.string().uuid();

export async function respondToCallbackAction(formData: FormData) {
  const token = uuid.parse(String(formData.get("token") ?? ""));
  const action = z.enum(["book", "decline"]).parse(String(formData.get("requestedAction") ?? ""));
  const selected = String(formData.get("slotId") ?? "");
  const admin = createSupabaseAdminClient();
  const { data: before } = await admin.from("callback_invitations").select("submission_id,project_id,slot_id").eq("public_token", token).maybeSingle();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("respond_to_callback_invitation", {
    invitation_token: token,
    requested_action: action,
    selected_slot_id: action === "book" ? uuid.parse(selected) : null
  });
  if (error) redirect(`/callbacks/${token}?error=${encodeURIComponent(error.message)}`);
  let warning = "";
  if (before) {
    const { data: after } = await admin.from("callback_invitations").select("slot_id").eq("public_token", token).maybeSingle();
    try {
      const result = await syncAuditionCalendarSlots(String(before.project_id), [String(before.slot_id ?? ""), String(after?.slot_id ?? "")].filter(Boolean));
      warning = result.warnings.join(" ");
    } catch (calendarError) { warning = calendarError instanceof Error ? calendarError.message : "Calendar sync failed."; }
  }
  const params = new URLSearchParams({ success: action === "book" ? "Your callback time is confirmed." : "Your callback response was recorded." });
  if (warning) params.set("warning", "Your response was saved, but the calendar invitation needs production-staff follow-up.");
  redirect(`/callbacks/${token}?${params}`);
}
