import { notFound } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { CastingOfferDocument } from "@/components/casting-offer-document";
import { CastingOfferResponse } from "@/components/casting-offer-response";
import type { OfferSnapshot } from "@/lib/casting-offers";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your role offer · Siena Theatre", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function CastingOfferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!z.string().uuid().safeParse(token).success) notFound();
  const admin = createSupabaseAdminClient();
  const { data: offer, error } = await admin.from("casting_offers").select("snapshot,status,expires_at,released_at,answers,responded_at").eq("public_token", token).maybeSingle();
  if (error) return <div className="page public-form-page"><section className="panel"><h1>Offer temporarily unavailable</h1><p>Please try again later or contact production management.</p></section></div>;
  if (!offer) notFound();
  if (offer.status === "superseded") return <div className="page public-form-page"><section className="panel"><h1>This offer has been updated</h1><p>Please use the latest offer link from production management. Your previous response remains on file.</p></section></div>;
  const snapshot = offer.snapshot as OfferSnapshot;
  const terminal = ["accepted", "declined"].includes(offer.status);
  const expired = new Date(offer.expires_at).getTime() <= Date.now();
  return <div className="page public-form-page"><header className="page-header"><div><p className="eyebrow">{snapshot.project_title} · Siena Theatre</p><h1>Your role offer</h1><p>{snapshot.role_name}</p></div></header>
    {terminal ? <section className="panel" role="status"><h2>{offer.status === "declined" ? "Your decline is recorded" : offer.released_at ? "Your role has been released for onboarding" : "Your acceptance is recorded"}</h2><p>{offer.status === "accepted" && !offer.released_at ? "Production management will review the company before releasing onboarding. You do not need to submit again." : "Your response and the agreement below remain on file."}</p></section> : null}
    {offer.status === "discussion" ? <p className="setup-success">Your discussion request is recorded. After speaking with production management, return here to accept or decline.</p> : null}
    <CastingOfferDocument snapshot={snapshot}/>
    {terminal ? <section className="panel"><h2>Response receipt</h2><p>Recorded name: {String(offer.answers?.typed_name ?? "")}</p><p>Anticipated credits: {String(offer.answers?.credit_choice || "Not selected")}</p><p>Recorded at: {offer.responded_at ? new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(offer.responded_at)) : ""} Eastern time.</p></section> : null}
    {!terminal && expired ? <p className="setup-warning">This offer has expired. Contact production management for an updated offer.</p> : !terminal ? <><p className="muted">Please respond by {new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(offer.expires_at))} Eastern time.</p><CastingOfferResponse token={token} snapshot={snapshot}/></> : null}
  </div>;
}
