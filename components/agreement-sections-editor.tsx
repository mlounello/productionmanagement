"use client";

import { useEffect, useRef, useState } from "react";
import { sanitizeRichText } from "@/lib/rich-text";

export type AgreementSection = {
  key: string;
  title: string;
  body: string;
  acknowledgement: string;
  requires_response: boolean;
};

function RichSectionBody({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value; }, [value]);
  function run(command: string, argument?: string) {
    ref.current?.focus();
    document.execCommand(command, false, argument);
    if (ref.current) onChange(ref.current.innerHTML);
  }
  return <div className="field">
    <span>Agreement text</span>
    <div className="rich-toolbar" role="toolbar" aria-label="Agreement text formatting">
      <button type="button" className="rich-tool-button" onClick={() => run("bold")}><strong>B</strong></button>
      <button type="button" className="rich-tool-button" onClick={() => run("italic")}><em>I</em></button>
      <button type="button" className="rich-tool-button" onClick={() => run("underline")}><u>U</u></button>
      <button type="button" className="rich-tool-button" onClick={() => run("formatBlock", "h3")}>Heading</button>
      <button type="button" className="rich-tool-button" onClick={() => run("insertUnorderedList")}>Bullets</button>
      <button type="button" className="rich-tool-button" onClick={() => run("insertOrderedList")}>Numbered</button>
      <button type="button" className="rich-tool-button" onClick={() => { const url=window.prompt("Link URL (https://…)"); if(url?.trim())run("createLink",url.trim()); }}>Link</button>
      <button type="button" className="rich-tool-button" onClick={() => run("removeFormat")}>Clear</button>
      <button type="button" className="rich-tool-button" onClick={() => run("undo")}>Undo</button>
      <button type="button" className="rich-tool-button" onClick={() => run("redo")}>Redo</button>
    </div>
    <div ref={ref} className="rich-editor agreement-rich-editor" contentEditable suppressContentEditableWarning data-placeholder="Write the agreement section…" onInput={() => ref.current&&onChange(ref.current.innerHTML)} onBlur={() => ref.current&&onChange(sanitizeRichText(ref.current.innerHTML))}/>
  </div>;
}

function isSection(value: unknown): value is AgreementSection {
  if(!value||typeof value!=="object")return false;
  const section=value as Record<string,unknown>;
  return typeof section.key==="string"&&typeof section.title==="string"&&typeof section.body==="string"&&typeof section.acknowledgement==="string"&&typeof section.requires_response==="boolean";
}

export function AgreementSectionsEditor({name,initialSections,label}:{name:string;initialSections:AgreementSection[];label:string}){
  const [sections,setSections]=useState(()=>initialSections.map((section)=>({...section,body:sanitizeRichText(section.body)})));
  const [sourceMode,setSourceMode]=useState(false);
  const [source,setSource]=useState(()=>JSON.stringify(initialSections,null,2));
  const [sourceError,setSourceError]=useState("");
  function update(index:number,change:Partial<AgreementSection>){setSections((current)=>current.map((section,itemIndex)=>itemIndex===index?{...section,...change}:section));}
  function move(index:number,direction:-1|1){setSections((current)=>{const target=index+direction;if(target<0||target>=current.length)return current;const next=[...current];[next[index],next[target]]=[next[target],next[index]];return next;});}
  function add(){setSections((current)=>[...current,{key:`section_${Date.now()}`,title:"New agreement section",body:"<p>Enter the agreement text here.</p>",acknowledgement:"I have read and agree to this section.",requires_response:true}]);}
  function showSource(){setSource(JSON.stringify(sections,null,2));setSourceError("");setSourceMode(true);}
  function hideSource(){try{const parsed=JSON.parse(source) as unknown;if(!Array.isArray(parsed)||!parsed.every(isSection))throw new Error("Source must be a list of complete agreement sections.");const keys=parsed.map((section)=>section.key);if(new Set(keys).size!==keys.length)throw new Error("Each section must have a unique key.");setSections(parsed.map((section)=>({...section,body:sanitizeRichText(section.body)})));setSourceError("");setSourceMode(false);}catch(error){setSourceError(error instanceof Error?error.message:"Source could not be read.");}}
  return <div className="agreement-sections-editor">
    <div className="section-heading"><div><strong>{label}</strong><p className="muted">Build sections visually. Source mode is optional for advanced changes.</p></div><button type="button" className="button secondary" onClick={sourceMode?hideSource:showSource}>{sourceMode?"Hide source":"View source"}</button></div>
    {sourceMode?<div className="field"><span>Section source</span><textarea className="rich-source-editor" rows={24} value={source} onChange={(event)=>setSource(event.target.value)}/>{sourceError?<small className="field-error">{sourceError}</small>:null}</div>:<div className="stacked-form">{sections.map((section,index)=><section className="agreement-editor-section" key={section.key}>
      <div className="agreement-editor-actions"><strong>Section {index+1}</strong><div><button type="button" className="button secondary" disabled={index===0} onClick={()=>move(index,-1)}>Move up</button><button type="button" className="button secondary" disabled={index===sections.length-1} onClick={()=>move(index,1)}>Move down</button><button type="button" className="button danger" onClick={()=>setSections((current)=>current.filter((_,itemIndex)=>itemIndex!==index))}>Remove</button></div></div>
      <label className="field"><span>Section heading</span><input value={section.title} onChange={(event)=>update(index,{title:event.target.value})}/></label>
      <RichSectionBody value={section.body} onChange={(body)=>update(index,{body})}/>
      <label className="field"><span>Required acknowledgement</span><textarea rows={3} value={section.acknowledgement} onChange={(event)=>update(index,{acknowledgement:event.target.value})}/></label>
      <label className="checkbox-card"><input type="checkbox" checked={section.requires_response} onChange={(event)=>update(index,{requires_response:event.target.checked})}/><span>Require the student to check this acknowledgement</span></label>
    </section>)}<button type="button" className="button secondary" onClick={add}>Add agreement section</button></div>}
    <textarea className="sr-only" aria-hidden name={name} value={JSON.stringify(sections)} onChange={()=>{}}/>
  </div>;
}
