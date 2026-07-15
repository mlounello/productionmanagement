"use client";

import { useState } from "react";
import type { AuditionFieldInput, AuditionFieldType, AuditionSectionInput } from "@/lib/auditions";

type Section = AuditionSectionInput & { id?: string };
type Field = AuditionFieldInput & { id?: string };

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

export function AuditionFormBuilder({ projectId, formId, initialSections, initialFields, action }: {
  projectId: string;
  formId: string;
  initialSections: Section[];
  initialFields: Field[];
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
                  {field.field_type==="slot_selector"?<fieldset><legend>Booking requirement rules</legend><div className="form-row"><label className="field"><span>Booking category</span><input value={field.settings?.booking_category??"general"} placeholder="dance or individual" onChange={(event)=>setFields((items)=>items.map((item,index)=>index===globalIndex?{...item,settings:{...item.settings,booking_category:keyFromLabel(event.target.value)}}:item))}/><small>Matches the category assigned to audition blocks.</small></label><label className="field"><span>Require the same day as</span><select value={field.settings?.same_day_as??""} onChange={(event)=>setFields((items)=>items.map((item,index)=>index===globalIndex?{...item,settings:{...item.settings,same_day_as:event.target.value}}:item))}><option value="">Allow any available day</option>{fields.filter((candidate)=>candidate.field_type==="slot_selector"&&candidate!==field).map((candidate)=><option key={candidate.field_key} value={candidate.field_key}>{candidate.label}</option>)}</select></label></div><div className="form-row"><label className="field"><span>Only show/require after this question</span><select value={field.conditional_logic?.field_key??""} onChange={(event)=>setFields((items)=>items.map((item,index)=>index===globalIndex?{...item,conditional_logic:{...item.conditional_logic,field_key:event.target.value}}:item))}><option value="">Always applies</option>{fields.filter((candidate)=>candidate.field_type!=="slot_selector"&&candidate!==field).map((candidate)=><option key={candidate.field_key} value={candidate.field_key}>{candidate.label}</option>)}</select></label><label className="field"><span>When the answer is</span><input value={field.conditional_logic?.value??""} placeholder="Yes or a choice label" onChange={(event)=>setFields((items)=>items.map((item,index)=>index===globalIndex?{...item,conditional_logic:{...item.conditional_logic,value:event.target.value}}:item))}/></label></div></fieldset>:null}
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
