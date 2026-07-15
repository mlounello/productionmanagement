import { notFound } from "next/navigation";
import { submitAuditionAction } from "@/app/auditions/[token]/actions";
import { requestIntakeVerificationCodeAction, verifyIntakeCodeAction } from "@/app/intake/actions";
import { getVerifiedProfile } from "@/lib/profile-intake";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type Field = { id: string; section_key: string; field_key: string; label: string; field_type: string; required: boolean; options: string[]; help_text: string; placeholder: string; sensitivity: string; sort_order: number };
type Section = { id: string; section_key: string; title: string; description: string; sort_order: number };
type Role = { id: string; name: string; role_group: string };
type Slot = { id: string; session_id: string; starts_at: string; ends_at: string | null; capacity: number; booked: number; label: string; slot_type: string };
type Session = { id: string; title: string; location: string; instructions: string; booking_mode: string };

const roleGroupOrder=["cast","directorial_team","creative_team","production_team","administrative","front_of_house","music_band","crew","designer","department_head","staff","guest_artist"];
function roleGroupLabel(value:string){return value.replace(/_/g," ").replace(/\b\w/g,(letter)=>letter.toUpperCase());}

function formatSlot(slot: Slot, session?: Session) {
  const start = new Date(slot.starts_at);
  const end = slot.ends_at ? new Date(slot.ends_at) : null;
  return `${session?.title ?? "Audition"} · ${start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}${end ? `–${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}${session?.location ? ` · ${session.location}` : ""} (${slot.capacity - Number(slot.booked)} open)`;
}

export default async function PublicAuditionPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams?: Promise<{ error?: string; success?: string; notice?: string; challenge?: string; profile?: string; preview?:string }> }) {
  const { token } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const preview=query?.preview==="1";
  const { data, error } = preview?await supabase.rpc("get_audition_form_preview",{form_token:token}):await supabase.rpc("get_public_audition_form", { form_token: token });
  if (error || !data) notFound();
  const payload = data as { form: { id: string; title: string; description: string }; project: { title: string }; sections: Section[]; fields: Field[]; roles: Role[]; slots: Slot[]; sessions: Session[] };
  const profile = preview?null:await getVerifiedProfile(query?.profile, "audition", payload.form.id);
  const profileValues: Record<string, string | string[]> = profile ? {
    email: profile.email, full_name: profile.full_name, preferred_name: profile.preferred_name, pronouns: profile.pronouns, phone: profile.phone,
    graduation_year: profile.affiliation.replace(/^Siena\s+/i, ""), special_skills: profile.special_skills, performance_experience: profile.performance_experience,
    production_interests: profile.technical_interests, vocal_range: profile.vocal_range, instruments: profile.instruments, dance_styles: profile.dance_styles, dance_movement: profile.dance_experience
  } : {};
  const sessionById = new Map(payload.sessions.map((session) => [session.id, session]));
  const availableSlots = payload.slots.filter((slot) => Number(slot.booked) < slot.capacity && sessionById.get(slot.session_id)?.booking_mode === "self_book");
  const renderField = (field: Field) => {
    const common = { name: field.field_key, required: field.required };
    const saved = profileValues[field.field_key];
    if (field.field_type === "long_text") return <textarea {...common} rows={5} placeholder={field.placeholder} defaultValue={typeof saved === "string" ? saved : ""} />;
    if (["short_text", "email", "phone"].includes(field.field_type)) return <input {...common} type={field.field_type === "email" ? "email" : field.field_type === "phone" ? "tel" : "text"} placeholder={field.placeholder} defaultValue={typeof saved === "string" ? saved : ""} readOnly={Boolean(profile) && field.field_key === "email"} />;
    if (field.field_type === "file") return <input {...common} type="file" accept={field.field_key === "headshot" ? "image/*" : ".pdf,.doc,.docx,image/*"} />;
    if (field.field_type === "role_selector") {
      if(!payload.roles.length)return <p className="muted">No vacant project roles are currently available.</p>;
      const grouped=new Map<string,Role[]>();
      for(const role of payload.roles)grouped.set(role.role_group,[...(grouped.get(role.role_group)??[]),role]);
      const groups=[...grouped.entries()].sort(([a],[b])=>{const ai=roleGroupOrder.indexOf(a),bi=roleGroupOrder.indexOf(b);return (ai<0?999:ai)-(bi<0?999:bi)||a.localeCompare(b);});
      return <div className="role-interest-groups"><p className="muted">Only currently vacant project roles are shown.</p>{groups.map(([group,roles])=><section key={group}><h3>{roleGroupLabel(group)}</h3><div className="choice-grid">{roles.map((role)=><label className="checkbox-card" key={role.id}><input type="checkbox" name={field.field_key} value={role.id}/><span>{role.name}</span></label>)}</div></section>)}</div>;
    }
    if (field.field_type === "slot_selector") return availableSlots.length ? <select name="audition_slot" required={field.required} defaultValue=""><option value="">Choose an available time</option>{availableSlots.map((slot) => <option key={slot.id} value={slot.id}>{formatSlot(slot, sessionById.get(slot.session_id))}</option>)}</select> : <p className="setup-warning">No self-bookable times are currently available. Staff will contact you if assignment is required.</p>;
    const options = field.field_type === "yes_no" ? ["Yes", "No"] : field.options;
    const checkbox = field.field_type === "multiple_choice" || field.field_type === "acknowledgement";
    const selected = Array.isArray(saved) ? saved : saved ? [saved] : [];
    return <div className="choice-grid">{options.map((option) => <label className="checkbox-card" key={option}><input type={checkbox ? "checkbox" : "radio"} name={field.field_key} value={option} required={field.required && !checkbox} defaultChecked={selected.includes(option)} /><span>{option}</span></label>)}</div>;
  };
  return <div className="page audition-public-page">
    <header className="page-header"><div><p className="eyebrow">{payload.project.title}</p><h1>{payload.form.title}</h1><p className="muted">{payload.form.description}</p></div></header>
    {preview?<p className="setup-warning"><strong>Secure staff preview.</strong> This is the current form layout. Profile verification and submission are disabled until the form is published.</p>:null}
    {query?.error ? <p className="setup-warning">{query.error}</p> : null}{query?.success ? <p className="setup-success">{query.success}</p> : null}{query?.notice ? <p className="setup-success">{query.notice}</p> : null}
    {!preview?<section className="panel"><h2>Load your saved Siena Theatre profile</h2><p className="muted">Optional: enter the email already on your profile and your exact 90# when applicable. We will email a six-digit verification code before filling saved vocal range, interests, experience, and skills.</p>
      <form action={requestIntakeVerificationCodeAction} className="form-row"><input type="hidden" name="contextType" value="audition"/><input type="hidden" name="contextId" value={payload.form.id}/><input type="hidden" name="contextToken" value={token}/><label className="field"><span>Email</span><input type="email" name="email" required/></label><label className="field"><span>90# (if applicable)</span><input name="vendorNumber"/></label><button type="submit">Load my saved profile</button></form>
      {query?.challenge?<form action={verifyIntakeCodeAction} className="form-row"><input type="hidden" name="contextType" value="audition"/><input type="hidden" name="contextId" value={payload.form.id}/><input type="hidden" name="contextToken" value={token}/><input type="hidden" name="challengeId" value={query.challenge}/><label className="field"><span>Six-digit verification code</span><input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required/></label><button type="submit">Verify and add details</button></form>:null}
    </section>:null}
    {preview?<fieldset className="stacked-form audition-preview-fields" disabled>
      {payload.sections.map((section) => {
        const fields = payload.fields.filter((field) => field.section_key === section.section_key);
        if (!fields.length) return null;
        return <section className={`panel audition-form-section ${fields.some((field) => field.sensitivity === "sensitive") ? "sensitive-section" : ""}`} key={section.id}>
          <h2>{section.title}</h2><p className="muted">{section.description}</p>
          <div className="stacked-form">{fields.map((field) => <label className="field audition-field" key={field.id}><span>{field.label}{field.required ? " *" : ""}</span>{field.help_text ? <small>{field.help_text}</small> : null}{renderField(field)}</label>)}</div>
        </section>;
      })}
      <button type="button" disabled>Preview only — publish to accept submissions</button>
    </fieldset>:<form action={submitAuditionAction} className="stacked-form" encType="multipart/form-data">
      <input type="hidden" name="formToken" value={token} />
      <input type="hidden" name="profileSession" value={query?.profile??""}/>
      <input type="hidden" name="fieldDefinitions" value={JSON.stringify(payload.fields.map(({ field_key, field_type, required }) => ({ field_key, field_type, required })))} />
      {payload.sections.map((section) => {
        const fields = payload.fields.filter((field) => field.section_key === section.section_key);
        if (!fields.length) return null;
        return <section className={`panel audition-form-section ${fields.some((field) => field.sensitivity === "sensitive") ? "sensitive-section" : ""}`} key={section.id}>
          <h2>{section.title}</h2><p className="muted">{section.description}</p>
          <div className="stacked-form">{fields.map((field) => <label className="field audition-field" key={field.id}><span>{field.label}{field.required ? " *" : ""}</span>{field.help_text ? <small>{field.help_text}</small> : null}{renderField(field)}</label>)}</div>
        </section>;
      })}
      <button type="submit">Submit audition form</button>
    </form>}
  </div>;
}
