"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { castingDraftSchema } from "@/lib/casting-drafts";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { sanitizeRichText } from "@/lib/rich-text";
import { completeAcceptedOnboarding } from "@/lib/role-acceptance";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function saveCastingDraftAction(formData: FormData): Promise<{ error?: string; success?: string }> {
  await requireUser();
  const parsed = castingDraftSchema.safeParse({
    projectId: formData.get("projectId"), id: formData.get("id") || undefined,
    revision: formData.get("revision") || undefined, personId: formData.get("personId"),
    roleId: formData.get("roleId"), coverageType: formData.get("coverageType"),
    coveredRoleIds: formData.getAll("coveredRoleIds"),
    additionalDuties: formData.get("additionalDuties") ?? "", actorNotes: formData.get("actorNotes") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const values = {
    project_id: input.projectId, person_id: input.personId, role_id: input.roleId,
    coverage_type: input.coverageType,
    covered_role_ids: input.coverageType === "none" ? [] : [...new Set(input.coveredRoleIds)],
    additional_duties: sanitizeRichText(input.additionalDuties), actor_notes: sanitizeRichText(input.actorNotes),
  };
  // User-scoped client/RLS: never use the service credential for draft edits.
  const result = input.id
    ? await supabase.from("casting_drafts").update(values).eq("id", input.id).eq("project_id", input.projectId).eq("revision", input.revision!).eq("status", "draft").select("id").maybeSingle()
    : await supabase.from("casting_drafts").insert(values).select("id").single();
  if (result.error) return { error: result.error.code === "23505" ? "This person already has an active draft for that role. Open their existing draft." : result.error.message };
  if (!result.data) return { error: "This draft changed or you no longer have access. Close and reopen it before editing." };
  revalidatePath(`/projects/${input.projectId}/casting`);
  return { success: "Casting draft saved. No email sent or assignment created." };
}

export async function setCastingDraftStatusAction(formData: FormData): Promise<{ error?: string; success?: string }> {
  await requireUser();
  const parsed = z.object({ projectId: z.string().uuid(), id: z.string().uuid(), revision: z.coerce.number().int().positive(), status: z.enum(["draft", "withdrawn"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid casting draft." };
  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("casting_drafts").update({ status: input.status }).eq("id", input.id).eq("project_id", input.projectId).eq("revision", input.revision).select("id").maybeSingle();
  if (error) return { error: error.code === "23505" ? "An active draft already exists for this person and role." : error.message };
  if (!data) return { error: "This draft changed or you no longer have access. Close and reopen it." };
  revalidatePath(`/projects/${input.projectId}/casting`);
  return { success: input.status === "withdrawn" ? "Draft withdrawn. Actor information and existing assignments are unchanged." : "Draft restored." };
}

export async function prepareCastingOfferAction(formData: FormData): Promise<{ error?: string; success?: string }> {
  await requireUser();
  const parsed = z.object({ projectId: z.string().uuid(), id: z.string().uuid(), revision: z.coerce.number().int().positive() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Reload this casting draft." };
  const supabase = await createSupabaseServerClient();
  const { data: draft } = await supabase.from("casting_drafts").select("id").eq("id", parsed.data.id).eq("project_id", parsed.data.projectId).maybeSingle();
  if (!draft) return { error: "Draft unavailable or casting manager access required." };
  const { error } = await supabase.rpc("prepare_casting_offer", { target_draft: parsed.data.id, expected_revision: parsed.data.revision });
  if (error) return { error: error.message };
  revalidatePath(`/projects/${parsed.data.projectId}/casting`);
  return { success: "Agreement prepared with a secure response link. No email has been sent." };
}

export async function releaseCastingOffersAction(formData: FormData): Promise<{ error?: string; success?: string }> {
  await requireUser();
  if (process.env.ENABLE_CASTING_RELEASE !== "true") return { error: "Company release is not enabled yet. Acceptance responses remain saved while Gmail and onboarding verification are completed." };
  const parsed = z.object({ projectId: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(100), confirmed: z.literal("yes") }).safeParse({ projectId: formData.get("projectId"), ids: formData.getAll("offerId"), confirmed: formData.get("confirmed") });
  if (!parsed.success) return { error: "Select accepted offers and confirm release." };
  const supabase = await createSupabaseServerClient();
  const problems: string[] = [];
  let released = 0;
  for (const id of [...new Set(parsed.data.ids)]) {
    const { data: offer } = await supabase.from("casting_offers").select("id,snapshot").eq("id", id).eq("project_id", parsed.data.projectId).maybeSingle();
    if (!offer) { problems.push("An offer is unavailable or access is denied."); continue; }
    const { data, error } = await supabase.rpc("release_casting_offer", { target_offer: id });
    if (error) { problems.push(`${offer.snapshot.person_name}: ${error.message}`); continue; }
    if (!data?.newly_released) continue;
    released++;
    // The transaction has saved the assignment, signed record, and release.
    // Provider failures cannot roll back or lose the student's acceptance.
    let warning = "";
    try { const result = await completeAcceptedOnboarding(String(data.request_id)); warning = result.warnings.join(" "); }
    catch (failure) { warning = failure instanceof Error ? failure.message : "Onboarding needs attention."; }
    const admin = createSupabaseAdminClient();
    const saved = await admin.from("casting_offers").update({ onboarding_status: warning ? "attention" : "complete", onboarding_error: warning }).eq("id", id);
    if (warning || saved.error) problems.push(`${offer.snapshot.person_name}: ${warning || "Released; onboarding status could not be saved. Check Onboarding."}`);
  }
  revalidatePath(`/projects/${parsed.data.projectId}/casting`);
  revalidatePath(`/projects/${parsed.data.projectId}/onboarding`);
  revalidatePath(`/projects/${parsed.data.projectId}/overview`);
  return { success: `${released} offer${released === 1 ? "" : "s"} released.`, ...(problems.length ? { error: problems.join(" ") } : {}) };
}
