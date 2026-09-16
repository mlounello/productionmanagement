import { sanitizeRichText } from "@/lib/rich-text";
import type { OfferSnapshot } from "@/lib/casting-offers";
import { ProjectScheduleDisplay } from "@/components/project-schedule-display";

export function CastingOfferDocument({ snapshot }: { snapshot: OfferSnapshot }) {
  return <>
    <section className="panel"><h2>{snapshot.person_name}</h2><p>Offered role: <strong>{snapshot.role_name}</strong></p>
      {snapshot.coverage_type !== "none" ? <p>{snapshot.coverage_type === "swing" ? "Swing" : "Understudy"} covering {snapshot.covered_roles.join(", ")}</p> : null}
      <div className="rich-render" dangerouslySetInnerHTML={{ __html: sanitizeRichText(snapshot.introduction) }}/>
      <div className="rich-render" dangerouslySetInnerHTML={{ __html: sanitizeRichText(snapshot.actor_notes) }}/>
      {snapshot.additional_duties ? <><h3>Additional duties</h3><div className="rich-render" dangerouslySetInnerHTML={{ __html: sanitizeRichText(snapshot.additional_duties) }}/></> : null}
    </section>
    <section className="panel"><h2>Production commitments</h2><ProjectScheduleDisplay schedule={snapshot.schedule}/></section>
    {snapshot.sections.map((section, index) => <section className="panel" key={`${section.key}-${index}`}><h2>{section.title}</h2><div className="rich-render" dangerouslySetInnerHTML={{ __html: sanitizeRichText(section.body) }}/></section>)}
  </>;
}
