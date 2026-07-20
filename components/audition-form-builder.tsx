"use client";

import { useState } from "react";
import type { AuditionFieldInput, AuditionFieldType, AuditionSectionInput } from "@/lib/auditions";

type Section = AuditionSectionInput & { id?: string };
type Field = AuditionFieldInput & { id?: string };
type BookingSession = { id: string; title: string; bookingCategory: string; startsAt: string };

const fieldTypes: Array<{ value: AuditionFieldType; label: string }> = [
  { value: "short_text", label: "Short text" }, { value: "long_text", label: "Long text" },
  { value: "email", label: "Email" }, { value: "phone", label: "Phone" },
  { value: "single_choice", label: "Single choice" }, { value: "multiple_choice", label: "Multiple choice" },
  { value: "yes_no", label: "Yes / No" }, { value: "acknowledgement", label: "Acknowledgement" },
  { value: "file", label: "File upload" }, { value: "role_selector", label: "Project role selector" },
  { value: "slot_selector", label: "Audition slot selector" }
];

function keyFromLabel(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80) || `question_${Date.now()}`;
}

function sessionLabel(session:BookingSession){return `${session.title} · ${new Date(session.startsAt).toLocaleString("en-US",{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",timeZone:"America/New_York"})}`;}

function BookingRulesEditor({field,fields,bookingCategories,bookingSessions,onChange}:{field:Field;fields:Field[];bookingCategories:Array<{value:string;label:string}>;bookingSessions:BookingSession[];onChange:(field:Field)=>void}){
  const settings=field.settings??{};const dependencyKey=settings.same_day_as??"";const dependency=fields.find((candidate)=>candidate.field_key===dependencyKey);const dependencyCategory=dependency?.settings?.booking_category??"general";const targetCategory=settings.booking_category??"general";const sourceSessions=bookingSessions.filter((session)=>session.bookingCategory===dependencyCategory);const targetSessions=bookingSessions.filter((session)=>session.bookingCategory===targetCategory);const mode=settings.dependency_filter??"same_day";const sessionMap=settings.session_map??{};
  const updateSettings=(changes:Partial<NonNullable<Field["settings"]>>)=>onChange({...field,settings:{...settings,...changes}});
  const toggle=(sourceId:string,targetId:string,checked:boolean)=>{const current=sessionMap[sourceId]??[];const next=checked?Array.from(new Set([...current,targetId])):current.filter((id)=>id!==targetId);updateSettings({session_map:{...sessionMap,[sourceId]:next}});};
  return <fieldset><legend>Booking requirement rules</legend><p className="muted">Use one audition slot selector question for each booking the applicant must make. A dependent booking can unlock by day or by an exact block-to-block answer map.</p><div className="form-row"><label className="field"><span>Audition block type shown by this question</span><select value={targetCategory} onChange={(event)=>updateSettings({booking_category:event.target.value})}>{bookingCategories.map((category)=><option key={category.value} value={category.value}>{category.label}</option>)}</select><small>These choices come directly from the audition blocks created for this project.</small>{bookingCategories.length===0?<small className="setup-warning">Create an audition block first, then return here to select its type.</small>:null}</label><label className="field"><span>Unlock after booking question</span><select value={dependencyKey} onChange={(event)=>updateSettings({same_day_as:event.target.value,session_map:{}})}><option value="">No booking dependency</option>{fields.filter((candidate)=>candidate.field_type==="slot_selector"&&candidate!==field&&candidate.sort_order<field.sort_order).map((candidate)=><option key={candidate.field_key} value={candidate.field_key}>{candidate.label}</option>)}</select><small>The prerequisite booking question must appear earlier in the form.</small></label></div>{dependencyKey?<label className="field"><span>How should the first booking filter this one?</span><select value={mode} onChange={(event)=>updateSettings({dependency_filter:event.target.value as "same_day"|"mapped_sessions"})}><option value="same_day">Show every matching-category time on the same day</option><option value="mapped_sessions">Show only specifically mapped audition blocks</option></select></label>:null}{dependencyKey&&mode==="mapped_sessions"?<div className="audition-session-map"><p><strong>Answer-to-answer block map</strong></p><p className="muted">For each possible answer in “{dependency?.label},” select exactly which {field.label} block or blocks should become available.</p>{sourceSessions.length&&targetSessions.length?sourceSessions.map((source)=><div className="audition-session-map-row" key={source.id}><strong>{sessionLabel(source)} opens:</strong><div className="choice-grid">{targetSessions.map((target)=><label className="checkbox-card" key={target.id}><input type="checkbox" checked={(sessionMap[source.id]??[]).includes(target.id)} onChange={(event)=>toggle(source.id,target.id,event.target.checked)}/><span>{sessionLabel(target)}</span></label>)}</div></div>):<p className="setup-warning">The source and destination questions must each reference a booking category with current audition blocks.</p>}</div>:null}<div className="form-row"><label className="field"><span>Only unlock after this non-booking question</span><select value={field.conditional_logic?.field_key??""} onChange={(event)=>onChange({...field,conditional_logic:{...field.conditional_logic,field_key:event.target.value}})}><option value="">Always applies</option>{fields.filter((candidate)=>candidate.field_type!=="slot_selector"&&candidate!==field&&candidate.sort_order<field.sort_order).map((candidate)=><option key={candidate.field_key} value={candidate.field_key}>{candidate.label}</option>)}</select></label><label className="field"><span>When the answer is</span><input value={field.conditional_logic?.value??""} placeholder="Yes or a choice label" onChange={(event)=>onChange({...field,conditional_logic:{...field.conditional_logic,value:event.target.value}})}/></label></div></fieldset>;
}

export function AuditionFormBuilder({ projectId, formId, initialSections, initialFields, bookingCategories, bookingSessions, action }: {
  projectId: string;
  formId: string;
  initialSections: Section[];
  initialFields: Field[];
  bookingCategories: Array<{ value: string; label: string }>;
  bookingSessions: BookingSession[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [sections, setSections] = useState(initialSections);
  const [fields, setFields] = useState(initialFields);
  const addSection = () => {
    const title = "New Section";
    setSections((items) => [...items, { section_key: `${keyFromLabel(title)}_${Date.now()}`, title, description: "", section_type: "custom", sort_order: items.length * 10 + 10 }]);
  };
  const addField = (sectionKey: string) => setFields((items) => [...items, {
    section_key: sectionKey, field_key: `question_${Date.now()}`, label: "New Question", field_type: "short_text",
    required: false, options: [], help_text: "", placeholder: "", sensitivity: "standard", profile_field: "", export_group: "custom", sort_order: items.length * 10 + 10,conditional_logic:{},settings:{}
  }]);
  const normalizedSections = sections.map((section, index) => ({ ...section, sort_order: (index + 1) * 10 }));
  const normalizedFields = fields.map((field, index) => ({ ...field, sort_order: (index + 1) * 10 }));

  return (
    <form action={action} className="stacked-form audition-builder">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="formId" value={formId} />
      <input type="hidden" name="sectionsJson" value={JSON.stringify(normalizedSections)} />
      <input type="hidden" name="fieldsJson" value={JSON.stringify(normalizedFields)} />
      {sections.map((section, sectionIndex) => (
        <section className="audition-builder-section" key={section.section_key}>
          <div className="audition-builder-heading">
            <div className="form-grid">
              <input aria-label="Section title" value={section.title} onChange={(event) => setSections((items) => items.map((item) => item.section_key === section.section_key ? { ...item, title: event.target.value } : item))} />
              <textarea aria-label="Section description" rows={2} value={section.description} onChange={(event) => setSections((items) => items.map((item) => item.section_key === section.section_key ? { ...item, description: event.target.value } : item))} />
            </div>
            <div className="button-stack">
              <button className="button secondary" type="button" disabled={sectionIndex === 0} onClick={() => setSections((items) => { const next = [...items]; [next[sectionIndex - 1], next[sectionIndex]] = [next[sectionIndex], next[sectionIndex - 1]]; return next; })}>Up</button>
              <button className="button secondary" type="button" disabled={sectionIndex === sections.length - 1} onClick={() => setSections((items) => { const next = [...items]; [next[sectionIndex + 1], next[sectionIndex]] = [next[sectionIndex], next[sectionIndex + 1]]; return next; })}>Down</button>
              <button className="button danger" type="button" onClick={() => { setSections((items) => items.filter((item) => item.section_key !== section.section_key)); setFields((items) => items.filter((item) => item.section_key !== section.section_key)); }}>Remove</button>
            </div>
          </div>
          <div className="stacked-form">
            {fields.filter((field) => field.section_key === section.section_key).map((field) => {
              const globalIndex = fields.findIndex((item) => item === field);
              return (
                <article className="audition-question-editor" key={`${field.field_key}-${globalIndex}`}>
                  <div className="form-row">
                    <label className="field"><span>Question</span><input value={field.label} onChange={(event) => setFields((items) => items.map((item, index) => index === globalIndex ? { ...item, label: event.target.value } : item))} /></label>
                    <label className="field"><span>Field key</span><input value={field.field_key} onChange={(event) => setFields((items) => items.map((item, index) => index === globalIndex ? { ...item, field_key: keyFromLabel(event.target.value) } : item))} /></label>
                  </div>
                  <div className="form-row">
                    <label className="field"><span>Answer type</span><select value={field.field_type} onChange={(event) => setFields((items) => items.map((item, index) => index === globalIndex ? { ...item, field_type: event.target.value as AuditionFieldType } : item))}>{fieldTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
                    <label className="field"><span>Export category</span><input value={field.export_group} onChange={(event) => setFields((items) => items.map((item, index) => index === globalIndex ? { ...item, export_group: keyFromLabel(event.target.value) } : item))} /></label>
                  </div>
                  <label className="field"><span>Help text</span><textarea rows={2} value={field.help_text} onChange={(event) => setFields((items) => items.map((item, index) => index === globalIndex ? { ...item, help_text: event.target.value } : item))} /></label>
                  {["single_choice", "multiple_choice", "acknowledgement"].includes(field.field_type) ? <label className="field"><span>Choices (one per line)</span><textarea rows={3} value={field.options.join("\n")} onChange={(event) => setFields((items) => items.map((item, index) => index === globalIndex ? { ...item, options: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean) } : item))} /></label> : null}
                  {field.field_type==="slot_selector"?<BookingRulesEditor field={field} fields={fields} bookingCategories={bookingCategories} bookingSessions={bookingSessions} onChange={(next)=>setFields((items)=>items.map((item,index)=>index===globalIndex?next:item))}/>:null}
                  <div className="form-actions">
                    <label className="checkbox-inline"><input type="checkbox" checked={field.required} onChange={(event) => setFields((items) => items.map((item, index) => index === globalIndex ? { ...item, required: event.target.checked } : item))} /><span>Required</span></label>
                    <label className="checkbox-inline"><input type="checkbox" checked={field.sensitivity === "sensitive"} onChange={(event) => setFields((items) => items.map((item, index) => index === globalIndex ? { ...item, sensitivity: event.target.checked ? "sensitive" : "standard" } : item))} /><span>Restricted/sensitive</span></label>
                    <button className="button secondary" type="button" disabled={globalIndex === 0} onClick={() => setFields((items) => { const next = [...items]; [next[globalIndex - 1], next[globalIndex]] = [next[globalIndex], next[globalIndex - 1]]; return next; })}>Move up</button>
                    <button className="button danger" type="button" onClick={() => setFields((items) => items.filter((_, index) => index !== globalIndex))}>Remove question</button>
                  </div>
                </article>
              );
            })}
          </div>
          <button className="button secondary" type="button" onClick={() => addField(section.section_key)}>Add question to section</button>
        </section>
      ))}
      <div className="form-actions"><button className="button secondary" type="button" onClick={addSection}>Add section</button><button type="submit">Save form builder</button></div>
    </form>
  );
}
