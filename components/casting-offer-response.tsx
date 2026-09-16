"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondToCastingOfferAction } from "@/app/casting-offer/[token]/actions";
import { anticipatedCreditHelp, type OfferSnapshot } from "@/lib/casting-offers";
import { sanitizeRichText } from "@/lib/rich-text";
import { ConflictResponseEditor } from "@/components/conflict-response-editor";

export function CastingOfferResponse({ token, snapshot }: { token: string; snapshot: OfferSnapshot }) {
  const [decision, setDecision] = useState("accepted");
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <form className="panel stacked-form" action={(data) => startTransition(async () => {
    try { const result = await respondToCastingOfferAction(data); setMessage(result); if (result.success) router.refresh(); }
    catch { setMessage({ error: "We could not confirm your response. Your entries remain here. Reload to check whether it was saved before trying again." }); }
  })}>
    <h2>Your response</h2>
    {message.error ? <p role="alert" className="setup-warning">{message.error}</p> : null}{message.success ? <p role="status" className="setup-success">{message.success}</p> : null}
    <fieldset disabled={pending} className="casting-fieldset"><input type="hidden" name="token" value={token}/>
      <label className="field"><span>Decision</span><select name="decision" value={decision} onChange={(event) => setDecision(event.target.value)}><option value="accepted">I accept this offer</option><option value="declined">I decline this offer</option><option value="discussion">I need to discuss this offer</option></select></label>
      {decision === "accepted" ? <>
        {snapshot.sections.filter((section) => section.requires_response).map((section, index) => <label className="check-row" key={`${section.key}-${index}`}><input type="checkbox" name={`ack_${section.key}`} required/><span className="rich-render" dangerouslySetInnerHTML={{ __html: sanitizeRichText(section.acknowledgement) }}/></label>)}
        <label className="check-row"><input type="checkbox" name="performanceAvailable" required/><span>I am available for every performance listed above. If I have a performance conflict, I will request a discussion before accepting.</span></label>
        <label className="field"><span>How many credits do you currently expect to register for?</span><select name="creditChoice" required defaultValue=""><option value="">Choose your anticipated credits</option>{snapshot.credit_options.map((choice) => <option key={choice}>{choice}</option>)}</select><small>{anticipatedCreditHelp}</small></label>
        {snapshot.conflict_windows?.length ? <ConflictResponseEditor windows={snapshot.conflict_windows}/> : null}
        <label className="field"><span>{snapshot.conflict_windows?.length ? "Additional conflict notes" : "Rehearsal conflicts"}</span><textarea name="conflicts" maxLength={6000} rows={4}/><small>{snapshot.conflict_windows?.length ? "Add context that does not fit one availability window." : "You can disclose rehearsal conflicts while accepting. Production management will review them."}</small></label>
        <label className="check-row"><input type="checkbox" name="electronicSignature" required/><span>By typing my full name below, I electronically sign this response and agree to the terms presented.</span></label>
      </> : null}
      <label className="field"><span>Your full name</span><input name="typedName" required minLength={2} maxLength={180} autoComplete="name"/></label>
      <label className="field"><span>Questions or comments</span><textarea name="comments" maxLength={6000} rows={4}/></label>
      <button type="submit">{pending ? "Saving your response…" : "Submit response"}</button>
    </fieldset>
  </form>;
}
