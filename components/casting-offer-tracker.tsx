"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { offerProgress, type CastingOffer } from "@/lib/casting-offers";
import { releaseCastingOffersAction } from "@/app/projects/[projectId]/casting/actions";

export function CastingOfferTracker({ projectId, offers, releaseEnabled }: { projectId: string; offers: CastingOffer[]; releaseEnabled: boolean }) {
  const progress = offerProgress(offers);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  const router = useRouter();
  return <section className="panel"><h2>Company acceptance</h2><p><strong>{progress.accepted} / {progress.total} offers accepted</strong> · {progress.discussion} discussion requested · {progress.declined} declined</p><progress aria-label="Offers accepted" value={progress.accepted} max={Math.max(1, progress.total)} style={{ width: "100%", accentColor: "#006747" }}/>
    <p className="muted">Acceptance is held for your release. You can release selected accepted actors before everyone has responded.</p>
    {message.error ? <p className="setup-warning" role="alert">{message.error}</p> : null}{message.success ? <p className="setup-success" role="status">{message.success}</p> : null}
    <form action={(data) => startTransition(async () => { try { const result = await releaseCastingOffersAction(data); setMessage(result); router.refresh(); } catch { setMessage({ error: "Release status could not be confirmed. Refresh and review the listed statuses before continuing." }); } })}>
      <input type="hidden" name="projectId" value={projectId}/>
      <fieldset disabled={pending} className="casting-fieldset"><div className="compact-list">{offers.filter((row) => row.status !== "superseded").map((offer) => <div className="compact-row" key={offer.id}>
        <label className="check-row"><input type="checkbox" name="offerId" value={offer.id} disabled={!releaseEnabled || offer.status !== "accepted" || Boolean(offer.released_at)}/><span><strong>{offer.snapshot.person_name}</strong><br/>{offer.snapshot.role_name} · {offer.released_at ? "Released" : offer.status === "accepted" ? "Accepted · awaiting your release" : offer.status === "prepared" && new Date(offer.expires_at).getTime() < Date.now() ? "Expired" : offer.status === "discussion" ? "Discussion requested" : offer.status}</span></label>
        <a className="button secondary" href={`/casting-offer/${offer.public_token}`} target="_blank" rel="noopener noreferrer">Open agreement</a>
        {offer.responded_at ? <details><summary>Review response</summary><p>Signed by: {offer.answers?.typed_name}</p><p>Anticipated credits: {offer.answers?.credit_choice || "Not selected"}</p><p style={{ whiteSpace: "pre-wrap" }}>Conflicts: {offer.answers?.conflicts || "None entered"}</p><p style={{ whiteSpace: "pre-wrap" }}>Comments: {offer.answers?.comments || "None entered"}</p></details> : null}
        {offer.released_at && offer.onboarding_status !== "complete" ? <p className="setup-warning">{offer.onboarding_error || "Onboarding requires verification. Review the Onboarding page before retrying any communications."}</p> : null}
      </div>)}</div>
      {!offers.length ? <p>Prepare an agreement from an actor’s draft to start tracking responses.</p> : null}
      {progress.releasable.length ? <><label className="check-row"><input type="checkbox" name="confirmed" value="yes" required disabled={!releaseEnabled}/><span>I approve the selected accepted actors for official assignments and onboarding.</span></label><button type="submit" disabled={!releaseEnabled}>{pending ? "Releasing selected actors…" : "Release selected accepted cast"}</button></> : null}
    </fieldset></form>
    {!releaseEnabled ? <p className="muted">Release activation is pending Gmail and onboarding verification. Responses can be recorded without starting onboarding.</p> : null}
    <p className="muted">Offer email sending is not enabled yet. Each link is private to its actor; opening it does not send email or submit a response.</p>
  </section>;
}
