import Link from "next/link";
import { notFound } from "next/navigation";
import { ProjectWorkspaceNav } from "@/components/project-workspace-nav";
import { RehearsalConflictsWorkspace } from "@/components/rehearsal-conflicts-workspace";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireUser } from "@/lib/auth";
import { conflictWindowSummary, shortTime, type ConflictWindowAnswer, type ConflictWindowSnapshot } from "@/lib/rehearsal-conflicts";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic="force-dynamic";
type WindowRow=ConflictWindowSnapshot&{active:boolean};
type ResponseRow={id:string;person_id:string;source_type:string;source_id:string;windows_snapshot:ConflictWindowSnapshot[];responses:ConflictWindowAnswer[];general_notes:string;submitted_at:string;people:{full_name:string;email:string}|null};

export default async function RehearsalConflictsPage({params}:{params:Promise<{projectId:string}>}){
  await requireUser();const{projectId}=await params;const supabase=await createSupabaseServerClient();
  const[{data:project},{data:canManageProject},{data:canManageApp},{data:canViewProject},{data:canViewApp},windowsResult,responsesResult,offersResult]=await Promise.all([
    supabase.from("projects").select("id,title").eq("id",projectId).maybeSingle(),
    supabase.rpc("has_project_role",{target_project_id:projectId,allowed_roles:["project_manager","producer"]}),supabase.rpc("has_app_role",{allowed_roles:["admin","producer"]}),
    supabase.rpc("has_project_role",{target_project_id:projectId,allowed_roles:["project_manager","producer","department_head","staff"]}),supabase.rpc("has_app_role",{allowed_roles:["admin","producer"]}),
    supabase.from("project_conflict_windows").select("*").eq("project_id",projectId).order("active",{ascending:false}).order("sort_order").order("day_of_week").order("starts_at"),
    supabase.from("rehearsal_conflict_responses").select("id,person_id,source_type,source_id,windows_snapshot,responses,general_notes,submitted_at,people(full_name,email)").eq("project_id",projectId).order("submitted_at",{ascending:false}),
    supabase.from("casting_offers").select("id,snapshot,status").eq("project_id",projectId)
  ]);
  if(!project)notFound();if(!canViewProject&&!canViewApp)return <div className="page"><h1>Rehearsal Conflicts</h1><p>Project staff access is required.</p></div>;
  const canManage=Boolean(canManageProject||canManageApp);const windows=(windowsResult.data??[]) as WindowRow[];const responses=(responsesResult.data??[]) as unknown as ResponseRow[];
  const latestByPerson=new Map<string,ResponseRow>();for(const response of responses)if(!latestByPerson.has(response.person_id))latestByPerson.set(response.person_id,response);const latest=[...latestByPerson.values()];
  const offerRole=new Map((offersResult.data??[]).map((offer)=>[offer.id,String((offer.snapshot as {role_name?:string})?.role_name??"")]));
  const union=new Map<string,ConflictWindowSnapshot>();for(const window of windows.filter((item)=>item.active))union.set(window.id,window);for(const response of latest)for(const window of response.windows_snapshot??[])if(!union.has(window.id))union.set(window.id,window);
  const reviewWindows=[...union.values()].sort((a,b)=>(a.day_of_week??8)-(b.day_of_week??8)||a.starts_at.localeCompare(b.starts_at));
  return <div className="page workspace-page"><header className="page-header"><div><p className="eyebrow">Stage Management</p><h1>{project.title} Rehearsal Conflicts</h1><p className="muted">Configure recurring or date-specific windows, then review the latest signed availability from each person.</p></div><div className="top-actions"><a className="button secondary" href={`/api/projects/${projectId}/conflicts/export`}>Download CSV</a><Link className="button secondary" href={`/projects/${projectId}/casting`}>Casting &amp; Offers</Link></div></header><ProjectWorkspaceNav projectId={projectId} active="conflicts"/>
    {windowsResult.error||responsesResult.error?<p className="setup-warning">The rehearsal-conflicts database update must be installed before this module can be used.</p>:<>
      <RehearsalConflictsWorkspace projectId={projectId} windows={windows} canManage={canManage}/>
      <section className="panel"><div className="section-heading"><div><p className="eyebrow">Stage-management view</p><h2>Latest submitted availability</h2><p>{latest.length} person{latest.length===1?"":"s"} with structured responses</p></div></div>
        {!latest.length?<p className="empty-state">No structured conflict responses have been submitted yet. New offers freeze the active windows above and collect them during acceptance.</p>:<div className="conflict-review-stack">{reviewWindows.map((window)=><details className="integration-panel" open key={window.id}><summary><strong>{window.label}</strong><span>{conflictWindowSummary(window)}</span></summary><div className="compact-list">{latest.map((response)=>{const answer=(response.responses??[]).find((item)=>item.window_id===window.id);if(!answer)return null;const role=response.source_type==="casting_offer"?offerRole.get(response.source_id):"";return <div className="compact-row conflict-review-row" key={`${window.id}-${response.id}`}><div><strong>{response.people?.full_name??"Person unavailable"}</strong><span>{role?`${role} · `:""}{response.people?.email??""}</span></div><StatusBadge status={answer.availability==="available"?"ready":"attention"} label={answer.availability==="available"?"Fully available":"Has conflicts"}/><div>{answer.availability==="unavailable"?<>{answer.unavailable.map((range,index)=><p key={index}><strong>{shortTime(range.starts_at)}–{shortTime(range.ends_at)}</strong>{range.reason?` · ${range.reason}`:""}</p>)}</>:<p>No unavailable time reported.</p>}{answer.preference_enabled?<p><strong>Preference:</strong> {shortTime(answer.preference_start)}–{shortTime(answer.preference_end)}{answer.preference_notes?` · ${answer.preference_notes}`:""}</p>:null}</div></div>;})}</div></details>)}</div>}
      </section>
      {latest.some((response)=>response.general_notes)?<section className="panel"><h2>Additional conflict notes</h2><div className="compact-list">{latest.filter((response)=>response.general_notes).map((response)=><div className="compact-row" key={response.id}><div><strong>{response.people?.full_name??"Person unavailable"}</strong><span>{new Date(response.submitted_at).toLocaleString()}</span></div><p style={{whiteSpace:"pre-wrap"}}>{response.general_notes}</p></div>)}</div></section>:null}
    </>}
  </div>;
}
