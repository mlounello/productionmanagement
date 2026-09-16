"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDatedScheduleEventsAction } from "@/app/projects/[projectId]/conflicts/actions";
import { scheduleCategories, scheduleCategoryLabels } from "@/lib/rehearsal-conflicts";

export function DatedScheduleBatchForm({projectId}:{projectId:string}){
  const router=useRouter();const[pending,startTransition]=useTransition();const[dates,setDates]=useState([""]);const[message,setMessage]=useState<{error?:string;success?:string}>({});
  return <form className="stacked-form schedule-batch-form" action={(data)=>startTransition(async()=>{const result=await addDatedScheduleEventsAction(data);setMessage(result);if(result.success){setDates([""]);router.refresh();}})}>
    <input type="hidden" name="projectId" value={projectId}/><div><h3>Add multiple dated calls</h3><p className="muted">Choose one or many dates, then apply the same call type and times. Every date becomes its own trackable schedule event.</p></div>
    {message.error?<p className="setup-warning" role="alert">{message.error}</p>:null}{message.success?<p className="setup-success" role="status">{message.success}</p>:null}
    <div className="form-row"><label className="field"><span>Call name *</span><input name="label" required placeholder="Performance or Dress Rehearsal"/></label><label className="field"><span>Category *</span><select name="category" defaultValue="performance">{scheduleCategories.filter(category=>category!=="rehearsal").map(category=><option key={category} value={category}>{scheduleCategoryLabels[category]}</option>)}</select></label><label className="field"><span>Location</span><input name="location" placeholder="Studio Theatre"/></label></div>
    <div className="schedule-date-picker"><strong>Selected dates</strong>{dates.map((date,index)=><div className="form-row" key={index}><label className="field"><span>Date {index+1}</span><input type="date" name="dates" required value={date} onChange={event=>setDates(current=>current.map((item,i)=>i===index?event.target.value:item))}/></label>{dates.length>1?<button className="secondary compact-button" type="button" onClick={()=>setDates(current=>current.filter((_,i)=>i!==index))}>Remove</button>:null}</div>)}<button className="secondary" type="button" onClick={()=>setDates(current=>[...current,""])}>Add another date</button></div>
    <div className="form-row"><label className="field"><span>Starts *</span><input type="time" name="startsAt" required defaultValue="18:00"/></label><label className="field"><span>Ends *</span><input type="time" name="endsAt" required defaultValue="23:00"/></label><label className="field"><span>Applies to</span><select name="appliesTo" defaultValue="all"><option value="cast">Cast</option><option value="crew">Crew</option><option value="all">Cast and crew</option></select></label></div>
    <label className="field"><span>Instructions</span><textarea name="instructions" rows={2} defaultValue="Review this required production call and report any conflict."/></label><div className="form-row"><label className="check-row"><input type="checkbox" name="required" defaultChecked/><span>Availability response required</span></label><label className="check-row"><input type="checkbox" name="includeInAudition" defaultChecked/><span>Include in audition schedule and conflicts</span></label></div>
    <button disabled={pending}>{pending?"Adding calls…":"Add dated calls"}</button>
  </form>;
}
