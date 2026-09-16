import type { CastingOffer } from "@/lib/casting-offers";

export function castingOfferEmail(offer: CastingOffer, siteUrl: string) {
  const link = `${siteUrl.replace(/\/+$/, "")}/casting-offer/${offer.public_token}`;
  const coverage = offer.snapshot.coverage_type === "none" ? "" : `<p><strong>${offer.snapshot.coverage_type === "swing" ? "Swing" : "Understudy"}:</strong> ${offer.snapshot.covered_roles.join(", ")}</p>`;
  return {
    subject: `${offer.snapshot.project_title} role offer — ${offer.snapshot.role_name}`,
    html: `<p>Hello ${offer.snapshot.person_name},</p><p>We are pleased to offer you the role of <strong>${offer.snapshot.role_name}</strong> in <strong>${offer.snapshot.project_title}</strong>.</p>${coverage}${offer.snapshot.actor_notes || ""}${offer.snapshot.additional_duties ? `<h2>Additional duties</h2>${offer.snapshot.additional_duties}` : ""}<p>Please review the complete role, schedule, attendance policy, agreements, and credit question at the secure link below. You may accept, decline, or request a discussion.</p><p><a href="${link}" style="display:inline-block;background:#006747;color:#fff;padding:14px 20px;border-radius:8px;text-decoration:none;font-weight:700">Review and respond to your offer</a></p><p>This private link is intended only for you. Your acceptance will be saved for Production Management review; onboarding does not begin until the company is released.</p>`,
    link
  };
}
