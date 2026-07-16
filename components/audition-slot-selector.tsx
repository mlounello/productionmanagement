"use client";

import { useEffect,useMemo,useState } from "react";

type Choice={id:string;label:string;startsAt:string};
type Condition={field_key?:string;value?:string};

function selectedValues(name:string){return Array.from(document.getElementsByName(name)).flatMap((element)=>{const input=element as HTMLInputElement|HTMLSelectElement;if("checked" in input&&(input.type==="radio"||input.type==="checkbox"))return input.checked?[input.value]:[];return input.value?[input.value]:[];});}
function day(value:string){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(value));const get=(type:string)=>parts.find((part)=>part.type===type)?.value??"";return `${get("year")}-${get("month")}-${get("day")}`;}

export function AuditionSlotSelector({fieldKey,required,choices,sameDayAs,condition}:{fieldKey:string;required:boolean;choices:Choice[];sameDayAs?:string;condition?:Condition}){
  const [dependencyDay,setDependencyDay]=useState("");const [conditionValues,setConditionValues]=useState<string[]>([]);
  useEffect(()=>{const names=[sameDayAs,condition?.field_key].filter(Boolean) as string[];const update=()=>{if(sameDayAs){const source=Array.from(document.getElementsByName(sameDayAs))[0] as HTMLSelectElement|undefined;setDependencyDay(source?.selectedOptions[0]?.dataset.day??"");}if(condition?.field_key)setConditionValues(selectedValues(condition.field_key));};update();for(const name of names)for(const element of Array.from(document.getElementsByName(name)))element.addEventListener("change",update);return()=>{for(const name of names)for(const element of Array.from(document.getElementsByName(name)))element.removeEventListener("change",update);};},[sameDayAs,condition?.field_key]);
  const active=!condition?.field_key||!condition.value||conditionValues.includes(condition.value);
  const filtered=useMemo(()=>dependencyDay?choices.filter((choice)=>day(choice.startsAt)===dependencyDay):choices,[choices,dependencyDay]);
  if(!active)return <p className="muted">This booking is not required based on your selections above.</p>;
  return <><select name={fieldKey} required={required} defaultValue=""><option value="">Choose an available time</option>{filtered.map((choice)=><option key={choice.id} value={choice.id} data-day={day(choice.startsAt)}>{choice.label}</option>)}</select>{sameDayAs&&!dependencyDay?<small>Choose the linked booking first; this list will then show times on that same day.</small>:null}{sameDayAs&&dependencyDay&&!filtered.length?<p className="setup-warning">No matching times remain on the selected day. Contact production staff for an arrangement.</p>:null}</>;
}
