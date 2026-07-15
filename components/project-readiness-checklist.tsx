import Link from "next/link";
import {ignoreProjectReadinessItemAction,restoreProjectReadinessItemAction} from "@/app/projects/[projectId]/readiness/actions";
import type {ProjectReadiness,ReadinessItem} from "@/lib/project-readiness";

const labels={ready:"Ready",attention:"Needs setup",off:"Off",optional:"Optional",ignored:"Ignored"} as const;

function Row({item,projectId}:{item:ReadinessItem;projectId:string}){
  const mark=item.state==="ready"?"✓":item.state==="attention"?"!":item.state==="off"?"–":item.state==="ignored"?"×":"○";
  const content=<><span className={`readiness-mark ${item.state}`} aria-hidden="true">{mark}</span><span className="readiness-copy"><strong>{item.title}</strong><small>{item.detail}</small></span></>;
  return <div className="readiness-row">
    {item.href?<Link className="readiness-main" href={item.href}>{content}</Link>:<div className="readiness-main">{content}</div>}
    <span className={`readiness-state ${item.state}`}>{labels[item.state]}</span>
    <span className="readiness-controls">
      {item.state==="attention"||item.state==="off"?<form action={ignoreProjectReadinessItemAction}><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="itemId" value={item.id}/><button className="readiness-ignore" type="submit">Ignore</button></form>:null}
      {item.state==="ignored"?<form action={restoreProjectReadinessItemAction}><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="itemId" value={item.id}/><button className="readiness-ignore" type="submit">Restore</button></form>:null}
      {item.href&&!["attention","off","ignored"].includes(item.state)?<Link className="readiness-arrow" href={item.href} aria-label={`Open ${item.title}`}>→</Link>:null}
    </span>
  </div>;
}

export function ProjectReadinessChecklist({readiness,projectId}:{readiness:ProjectReadiness;projectId:string}){
  const percent=readiness.required?Math.round(readiness.ready/readiness.required*100):100;
  return <section className="panel workspace-section project-readiness"><div className="section-heading"><div><p className="eyebrow">Project Readiness</p><h2>Automation and integration setup</h2><p className="muted">This live checklist updates whenever you return to Overview. Open a row to configure it, or ignore a check that is not required for this project.</p></div><div className={`readiness-score ${readiness.attention?"attention":"ready"}`}><strong>{percent}%</strong><span>{readiness.ready} of {readiness.required} required checks ready</span></div></div><div className="readiness-progress" aria-label={`${percent}% of required project configuration is ready`}><span style={{width:`${percent}%`}}/></div><div className="readiness-sections">{readiness.sections.map((section)=><section className="readiness-section" key={section.id}><header><h3>{section.title}</h3><p>{section.description}</p></header><div>{section.items.map((item)=><Row item={item} projectId={projectId} key={item.id}/>)}</div></section>)}</div></section>;
}
