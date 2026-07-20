"use client";

import { useEffect,useMemo,useState } from "react";

type Choice={id:string;label:string;startsAt:string};
type Condition={field_key?:string;value?:string};

function selectedValues(name:string){return Array.from(document.getElementsByName(name)).flatMap((element)=>{const input=element as HTMLInputElement|HTMLSelectElement;if("checked" in input&&(input.type==="radio"||input.type==="checkbox"))return input.checked?[input.value]:[];return input.value?[input.value]:[];});}
function day(value:string){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(value));const get=(type:string)=>parts.find((part)=>part.type===type)?.value??"";return `${get("year")}-${get("month")}-${get("day")}`;}

export function AuditionSlotSelector({fieldKey,required,choices,sameDayAs,condition}:{fieldKey:string;required:boolean;choices:Choice[];sameDayAs?:string;condition?:Condition}){
  const [dependencyDay,setDependencyDay]=useState("");const [conditionValues,setConditionValues]=useState<string[]>([]);const [selected,setSelected]=useState("");
  useEffect(()=>{const names=[sameDayAs,condition?.field_key].filter(Boolean) as string[];const update=()=>{if(sameDayAs){const source=Array.from(document.getElementsByName(sameDayAs))[0] as HTMLSelectElement|undefined;const nextDay=source?.selectedOptions[0]?.dataset.day??"";setDependencyDay((current)=>{if(current!==nextDay)setSelected("");return nextDay;});}if(condition?.field_key)setConditionValues(selectedValues(condition.field_key));};update();for(const name of names)for(const element of Array.from(document.getElementsByName(name)))element.addEventListener("change",update);return()=>{for(const name of names)for(const element of Array.from(document.getElementsByName(name)))element.removeEventListener("change",update);};},[sameDayAs,condition?.field_key]);
  const active=!condition?.field_key||!condition.value||conditionValues.includes(condition.value);
  const filtered=useMemo(()=>dependencyDay?choices.filter((choice)=>day(choice.startsAt)===dependencyDay):choices,[choices,dependencyDay]);
  const waitingForLinkedBooking=Boolean(sameDayAs)&&!dependencyDay;const locked=!active||waitingForLinkedBooking;
  return <div className={`audition-slot-control${locked?" is-locked":""}`}><select name={fieldKey} required={required&&!locked} disabled={locked} value={selected} onChange={(event)=>setSelected(event.target.value)} aria-disabled={locked}><option value="">{!active?"Complete the required question above first":waitingForLinkedBooking?"Choose the linked audition block first":"Choose an available time"}</option>{!locked?filtered.map((choice)=><option key={choice.id} value={choice.id} data-day={day(choice.startsAt)}>{choice.label}</option>):null}</select>{!active?<small>This audition booking will unlock when the required answer above is selected.</small>:null}{active&&waitingForLinkedBooking?<small>Choose the linked audition block first. Individual times will then unlock and show only the matching audition day.</small>:null}{sameDayAs&&dependencyDay&&!filtered.length?<p className="setup-warning">No matching times remain on the selected day. Contact production staff for an arrangement.</p>:null}</div>;
}
