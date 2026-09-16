export type OfferSection = { key: string; title: string; body: string; acknowledgement: string; requires_response: boolean };
export type OfferSnapshot = {
  name: string; type: string; version: number; person_name: string; project_title: string; role_name: string;
  introduction: string; sections: OfferSection[]; credit_options: string[];
  coverage_type: string; covered_roles: string[]; additional_duties: string; actor_notes: string;
  schedule: { rehearsals: string; tech_and_dress: string; performances_and_strike: string };
};
export type CastingOffer = {
  id: string; draft_id: string; project_id: string; draft_revision: number; public_token: string;
  status: "prepared" | "accepted" | "declined" | "discussion" | "superseded";
  snapshot: OfferSnapshot; expires_at: string; responded_at: string | null; released_at: string | null;
  onboarding_status: string; onboarding_error: string;
  email_job_id?: string | null; delivery_status?: "not_sent" | "queued" | "processing" | "sent" | "failed" | "uncertain" | "cancelled"; delivery_error?: string; sent_at?: string | null; provider_message_id?: string | null;
  answers?: { typed_name?: string; credit_choice?: string; conflicts?: string; comments?: string };
};
export function offerProgress(offers: CastingOffer[]) {
  const current = offers.filter((offer) => offer.status !== "superseded");
  const accepted = current.filter((offer) => offer.status === "accepted").length;
  return { total: current.length, accepted, percent: current.length ? Math.round(accepted / current.length * 100) : 0,
    discussion: current.filter((offer) => offer.status === "discussion").length,
    declined: current.filter((offer) => offer.status === "declined").length,
    releasable: current.filter((offer) => offer.status === "accepted" && !offer.released_at) };
}
export const anticipatedCreditHelp = "All students must register for this production for 0–3 credits. This is your anticipated choice, not official registration. Krysta will give a credit presentation and help you select and officially register for the appropriate number of credits.";
