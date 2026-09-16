"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { OfferSnapshot } from "@/lib/casting-offers";
import { notifyProjectManagers } from "@/lib/project-admin-notifications";

export async function respondToCastingOfferAction(formData: FormData): Promise<{ error?: string; success?: string }> {
  const parsed = z.object({ token: z.string().uuid(), decision: z.enum(["accepted", "declined", "discussion"]), typedName: z.string().trim().min(2).max(180), comments: z.string().max(6000), conflicts: z.string().max(6000), creditChoice: z.string().max(120) }).safeParse({ token: formData.get("token"), decision: formData.get("decision"), typedName: formData.get("typedName"), comments: formData.get("comments") ?? "", conflicts: formData.get("conflicts") ?? "", creditChoice: formData.get("creditChoice") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;
  const admin = createSupabaseAdminClient();
  const { data: offer, error } = await admin.from("casting_offers").select("id,snapshot,project_id,casting_drafts(person_id)").eq("public_token", input.token).maybeSingle();
  if (error || !offer) return { error: "This offer could not be loaded. Please contact production management." };
  const snapshot = offer.snapshot as OfferSnapshot;
  const response = { decision: input.decision, typed_name: input.typedName, comments: input.comments, conflicts: input.conflicts, credit_choice: input.creditChoice,
    performance_available: formData.get("performanceAvailable") === "on", electronic_signature: formData.get("electronicSignature") === "on",
    acknowledgements: Object.fromEntries(snapshot.sections.filter((section) => section.requires_response).map((section) => [section.key, formData.get(`ack_${section.key}`) === "on"])) };
  const result = await admin.rpc("respond_to_casting_offer", { offer_token: input.token, response });
  if (result.error) return { error: result.error.message };
  try {
    const draft = offer.casting_drafts as unknown as { person_id?: string } | null;
    const decisionLabel = result.data === "accepted" ? "accepted" : result.data === "declined" ? "declined" : "requested a discussion about";
    await notifyProjectManagers({ projectId: String(offer.project_id), personId: draft?.person_id, offerId: String(offer.id), eventType: `casting_${result.data}`, subject: `${snapshot.person_name} ${decisionLabel} their ${snapshot.project_title} offer`, heading: result.data === "accepted" ? "Casting offer accepted" : result.data === "declined" ? "Casting offer declined" : "Casting discussion requested", message: `${snapshot.person_name} ${decisionLabel} the offer for ${snapshot.role_name}. Open Casting & Offers to review their response.`, actionLabel: "Review casting response", actionPath: `/projects/${offer.project_id}/casting`, idempotencyKey: `casting-response-${offer.id}-${result.data}` });
  } catch {}
  revalidatePath(`/projects/${offer.project_id}/casting`);
  revalidatePath(`/casting-offer/${input.token}`);
  return { success: result.data === "accepted" ? "Your acceptance is saved and awaiting production-manager release. Onboarding has not started." : result.data === "declined" ? "Your decision is saved for production management to review." : "Your discussion request is saved. You can return to this link to accept or decline after speaking with production management." };
}
