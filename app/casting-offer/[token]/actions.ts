"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { OfferSnapshot } from "@/lib/casting-offers";

export async function respondToCastingOfferAction(formData: FormData): Promise<{ error?: string; success?: string }> {
  const parsed = z.object({ token: z.string().uuid(), decision: z.enum(["accepted", "declined", "discussion"]), typedName: z.string().trim().min(2).max(180), comments: z.string().max(6000), conflicts: z.string().max(6000), creditChoice: z.string().max(120) }).safeParse({ token: formData.get("token"), decision: formData.get("decision"), typedName: formData.get("typedName"), comments: formData.get("comments") ?? "", conflicts: formData.get("conflicts") ?? "", creditChoice: formData.get("creditChoice") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;
  const admin = createSupabaseAdminClient();
  const { data: offer, error } = await admin.from("casting_offers").select("snapshot,project_id").eq("public_token", input.token).maybeSingle();
  if (error || !offer) return { error: "This offer could not be loaded. Please contact production management." };
  const snapshot = offer.snapshot as OfferSnapshot;
  const response = { decision: input.decision, typed_name: input.typedName, comments: input.comments, conflicts: input.conflicts, credit_choice: input.creditChoice,
    performance_available: formData.get("performanceAvailable") === "on", electronic_signature: formData.get("electronicSignature") === "on",
    acknowledgements: Object.fromEntries(snapshot.sections.filter((section) => section.requires_response).map((section) => [section.key, formData.get(`ack_${section.key}`) === "on"])) };
  const result = await admin.rpc("respond_to_casting_offer", { offer_token: input.token, response });
  if (result.error) return { error: result.error.message };
  revalidatePath(`/projects/${offer.project_id}/casting`);
  revalidatePath(`/casting-offer/${input.token}`);
  return { success: result.data === "accepted" ? "Your acceptance is saved and awaiting production-manager release. Onboarding has not started." : result.data === "declined" ? "Your decision is saved for production management to review." : "Your discussion request is saved. You can return to this link to accept or decline after speaking with production management." };
}
