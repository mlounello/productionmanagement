"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { offerProgress, type CastingOffer } from "@/lib/casting-offers";
import { releaseCastingOffersAction, sendCastingOffersAction } from "@/app/projects/[projectId]/casting/actions";
import { castingOfferEmail } from "@/lib/casting-offer-email";

export function CastingOfferTracker({ projectId, offers, releaseEnabled, siteUrl }: { projectId: string; offers: CastingOffer[]; releaseEnabled: boolean; siteUrl: string }) {
  const progress = offerProgress(offers);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  const router = useRouter();
  const sendable = offers.filter((offer) => offer.status === "prepared" && !["sent","uncertain"].includes(offer.delivery_status ?? "not_sent") && new Date(offer.expires_at).getTime() > Date.now());
  return <section className="panel"><h2>Company acceptance</h2><p><strong>{progress.accepted} / {progress.total} offers accepted</strong> · {progress.discussion} discussion requested · {progress.declined} declined</p><progress aria-label="Offers accepted" value={progress.accepted} max={Math.max(1, progress.total)} style={{ width: "100%", accentColor: "#006747" }}/>
    <p className="muted">Acceptance is held for your release. You can release selected accepted actors before everyone has responded.</p>
    {message.error ? <p className="setup-warning" role="alert">{message.error}</p> : null}{message.success ? <p className="setup-success" role="status">{message.success}</p> : null}
    {sendable.length ? <form action={(data) => startTransition(async () => { try { const result = await sendCastingOffersAction(data); setMessage(result); router.refresh(); } catch { setMessage({ error: "Offer delivery could not be confirmed. Refresh and inspect each delivery status before retrying." }); } })}>
      <input type="hidden" name="projectId" value={projectId}/><fieldset disabled={pending} className="casting-fieldset"><h3>Reviewed offer sending</h3><p className="muted">Select only recipients whose exact role, agreement, and email preview you reviewed. Messages are sent from your connected Siena Gmail account.</p>
      <div className="compact-list">{sendable.map((offer) => { const email = castingOfferEmail(offer, siteUrl); return <div className="compact-row" key={`send-${offer.id}`}><label className="check-row"><input type="checkbox" name="offerId" value={offer.id}/><span><strong>{offer.snapshot.person_name}</strong><br/>{offer.snapshot.role_name} · {offer.delivery_status === "failed" ? "Failed — eligible for reviewed retry" : offer.delivery_status ?? "Not sent"}</span></label><details><summary>Preview exact offer email</summary><p><strong>Subject:</strong> {email.subject}</p><div className="rich-render" dangerouslySetInnerHTML={{ __html: email.html }}/></details></div>; })}</div>
      <label className="check-row"><input type="checkbox" name="confirmed" value="send" required/><span>I reviewed every selected recipient, role, agreement, and email preview.</span></label><button type="submit">{pending ? "Sending reviewed offers…" : "Send selected offers"}</button></fieldset>
    </form> : null}
    <form action={(data) => startTransition(async () => { try { const result = await releaseCastingOffersAction(data); setMessage(result); router.refresh(); } catch { setMessage({ error: "Release status could not be confirmed. Refresh and review the listed statuses before continuing." }); } })}>
      <input type="hidden" name="projectId" value={projectId}/>
      <fieldset disabled={pending} className="casting-fieldset"><div className="compact-list">{offers.filter((row) => row.status !== "superseded").map((offer) => <div className="compact-row" key={offer.id}>
        <label className="check-row"><input type="checkbox" name="offerId" value={offer.id} disabled={!releaseEnabled || offer.status !== "accepted" || Boolean(offer.released_at)}/><span><strong>{offer.snapshot.person_name}</strong><br/>{offer.snapshot.role_name} · {offer.released_at ? "Released" : offer.status === "accepted" ? "Accepted · awaiting your release" : offer.status === "prepared" && new Date(offer.expires_at).getTime() < Date.now() ? "Expired" : offer.status === "discussion" ? "Discussion requested" : offer.status}<br/><small>Email: {offer.delivery_status === "sent" ? `Sent${offer.sent_at ? ` ${new Date(offer.sent_at).toLocaleString()}` : ""}` : offer.delivery_status === "uncertain" ? "Uncertain — check Siena Sent" : offer.delivery_status === "failed" ? `Failed — ${offer.delivery_error || "review required"}` : offer.delivery_status ?? "Not sent"}</small></span></label>
        <a className="button secondary" href={`/casting-offer/${offer.public_token}`} target="_blank" rel="noopener noreferrer">Open agreement</a>
        {offer.responded_at ? <details><summary>Review response</summary><p>Signed by: {offer.answers?.typed_name}</p><p>Anticipated credits: {offer.answers?.credit_choice || "Not selected"}</p><p style={{ whiteSpace: "pre-wrap" }}>Conflicts: {offer.answers?.conflicts || "None entered"}</p><p style={{ whiteSpace: "pre-wrap" }}>Comments: {offer.answers?.comments || "None entered"}</p></details> : null}
        {offer.released_at && offer.onboarding_status !== "complete" ? <p className="setup-warning">{offer.onboarding_error || "Onboarding requires verification. Review the Onboarding page before retrying any communications."}</p> : null}
      </div>)}</div>
      {!offers.length ? <p>Prepare an agreement from an actor’s draft to start tracking responses.</p> : null}
      {progress.releasable.length ? <><label className="check-row"><input type="checkbox" name="confirmed" value="yes" required disabled={!releaseEnabled}/><span>I approve the selected accepted actors for official assignments and onboarding.</span></label><button type="submit" disabled={!releaseEnabled}>{pending ? "Releasing selected actors…" : "Release selected accepted cast"}</button></> : null}
    </fieldset></form>
    {!releaseEnabled ? <p className="muted">Release activation is pending Gmail and onboarding verification. Responses can be recorded without starting onboarding.</p> : null}
    <p className="muted">Each secure link is private to its actor. Preparing or previewing an agreement never sends it.</p>
  </section>;
}
