"use client";

import { useMemo, useState } from "react";
import { createCommunicationDraftAction } from "@/app/projects/[projectId]/communications/actions";
import { HtmlMessageEditor } from "@/components/html-message-editor";
import { communicationTypeLabel } from "@/lib/communications";

type Template = { id: string; name: string; template_type: string; subject_template: string; body_template: string };
type Person = { id: string; name: string; email: string };

const defaults: Record<string, { subject: string; body: string }> = {
  cast_announcement: { subject: "{{project_title}} cast announcement", body: "<h3>Hello {{person_name}},</h3><p>We are pleased to share the cast announcement for <strong>{{project_title}}</strong>.</p><p>Your role: <strong>{{role_name}}</strong></p>" },
  crew_announcement: { subject: "Welcome to the {{project_title}} team", body: "<h3>Hello {{person_name}},</h3><p>Welcome to the <strong>{{project_title}}</strong> production team.</p><p>Your role: <strong>{{role_name}}</strong></p>" },
  role_confirmation: { subject: "Please confirm your role in {{project_title}}", body: "<h3>Hello {{person_name}},</h3><p>Please review and confirm your assignment as <strong>{{role_name}}</strong> for <strong>{{project_title}}</strong>.</p>" },
  audition_reminder: { subject: "{{project_title}} audition reminder", body: "<h3>Hello {{person_name}},</h3><p>This is a reminder about your upcoming audition for <strong>{{project_title}}</strong>.</p>" },
  audition_callback: { subject: "{{project_title}} callback invitation", body: "<h3>Hello {{person_name}},</h3><p>We would like to invite you to a callback for <strong>{{project_title}}</strong>.</p>" },
  recognition: { subject: "Congratulations on {{recognition_title}}", body: "<h3>Congratulations, {{person_name}}!</h3><p>We are pleased to recognize you for <strong>{{recognition_title}}</strong>.</p>" },
  custom: { subject: "A message about {{project_title}}", body: "<h3>Hello {{person_name}},</h3><p></p>" },
};

export function CommunicationComposer({ projectId, templates, roleGroups, assignmentStatuses, auditionStatuses, people }: { projectId: string; templates: Template[]; roleGroups: string[]; assignmentStatuses: string[]; auditionStatuses: string[]; people: Person[] }) {
  const [messageType, setMessageType] = useState("custom");
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState(defaults.custom.subject);
  const [body, setBody] = useState(defaults.custom.body);
  const [editorKey, setEditorKey] = useState(0);
  const [audienceMode, setAudienceMode] = useState("all");
  const [audienceValue, setAudienceValue] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const visiblePeople = useMemo(() => people.filter((person) => `${person.name} ${person.email}`.toLowerCase().includes(search.toLowerCase())).slice(0, 100), [people, search]);

  function applyType(next: string) {
    setMessageType(next); setTemplateId(""); setSubject(defaults[next]?.subject ?? defaults.custom.subject); setBody(defaults[next]?.body ?? defaults.custom.body); setEditorKey((value) => value + 1);
  }
  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((item) => item.id === id);
    if (template) { setMessageType(template.template_type); setSubject(template.subject_template); setBody(template.body_template); setEditorKey((value) => value + 1); }
  }
  function applyAudience(mode: string) {
    setAudienceMode(mode); setAudienceValue("");
  }
  const options = audienceMode === "role_group" ? roleGroups : audienceMode === "assignment_status" ? assignmentStatuses : auditionStatuses;

  return <form action={createCommunicationDraftAction} className="stacked-form">
    <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="templateId" value={templateId} />
    {selected.map((id) => <input type="hidden" name="personId" value={id} key={id} />)}
    <div className="form-row"><label className="field"><span>Message type</span><select name="messageType" value={messageType} onChange={(event) => applyType(event.target.value)}>{Object.keys(defaults).map((type) => <option value={type} key={type}>{communicationTypeLabel(type)}</option>)}</select></label><label className="field"><span>Start from template</span><select value={templateId} onChange={(event) => applyTemplate(event.target.value)}><option value="">Siena starter for this message type</option>{templates.map((template) => <option value={template.id} key={template.id}>{template.name} · {communicationTypeLabel(template.template_type)}</option>)}</select></label></div>
    <label className="field"><span>Internal campaign name</span><input name="name" defaultValue="Production announcement" required maxLength={160} /></label>
    <fieldset><legend>Recipients</legend><div className="choice-grid">{[["all","Everyone on the project"],["role_group","One role group"],["assignment_status","Assignment status"],["audition_status","Audition status"],["individual","Selected people"]].map(([value,label]) => <label className="checkbox-card" key={value}><input type="radio" name="audienceMode" value={value} checked={audienceMode === value} onChange={() => applyAudience(value)} /><span>{label}</span></label>)}</div>
      {!["all","individual"].includes(audienceMode) ? <label className="field"><span>{communicationTypeLabel(audienceMode)}</span><select name="audienceValue" value={audienceValue} onChange={(event) => setAudienceValue(event.target.value)} required><option value="">Choose one</option>{options.map((option) => <option value={option} key={option}>{communicationTypeLabel(option)}</option>)}</select></label> : <input type="hidden" name="audienceValue" value="" />}
      {audienceMode === "individual" ? <div className="recipient-picker"><label className="field"><span>Search project people</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or email" /></label><div className="compact-list">{visiblePeople.map((person) => <label className="check-row" key={person.id}><input type="checkbox" checked={selected.includes(person.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, person.id])] : current.filter((id) => id !== person.id))} /><span><strong>{person.name}</strong> · {person.email || "No email"}</span></label>)}</div><small>{selected.length} selected. Showing up to 100 search results at a time.</small></div> : null}
    </fieldset>
    <label className="field"><span>Subject</span><input name="subject" value={subject} onChange={(event) => setSubject(event.target.value)} required maxLength={300} /></label>
    <HtmlMessageEditor key={editorKey} name="bodyHtml" initialValue={body} label="HTML email message" />
    <small>Variables: person_name, full_name, preferred_name, project_title, role_name, role_group. Recognition drafts also support recognition_title, recognition_issuer, recognition_date, and recognition_description.</small>
    <button type="submit">Generate review draft</button>
  </form>;
}
