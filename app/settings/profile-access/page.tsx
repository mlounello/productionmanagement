import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { defaultProfileAccessTemplate } from "@/lib/profile-access-links";
import { saveProfileAccessTemplateAction } from "@/app/settings/profile-access/actions";

export const dynamic = "force-dynamic";

export default async function ProfileAccessSettingsPage({ searchParams }: { searchParams?: Promise<{ error?: string; success?: string }> }) {
  await requireUser();
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: template } = await supabase.from("email_templates").select("subject_template, body_template").eq("template_type", "profile_access").is("project_id", null).eq("active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return <div className="page workspace-page">
    <div className="page-header"><div><p className="eyebrow">Settings</p><h1>Profile Access Email</h1><p className="muted">Customize the branded email sent when someone is invited to update their Production Management profile.</p></div><Link className="button secondary" href="/settings/reference-data">Reference Data</Link></div>
    {query?.error ? <p className="setup-warning">{query.error}</p> : null}
    {query?.success ? <p className="setup-success">{query.success}</p> : null}
    <section className="panel" style={{ maxWidth: 900 }}>
      <form action={saveProfileAccessTemplateAction} className="stacked-form">
        <label className="field"><span>Subject</span><input name="subject" defaultValue={template?.subject_template || defaultProfileAccessTemplate.subject} required /></label>
        <label className="field"><span>HTML body</span><textarea name="body" rows={20} defaultValue={template?.body_template || defaultProfileAccessTemplate.body} required /></label>
        <p className="muted">Variables: <code>{"{{person_name}}"}</code>, <code>{"{{profile_access_url}}"}</code>, <code>{"{{expires_in}}"}</code></p>
        <button type="submit">Save profile access email</button>
      </form>
    </section>
  </div>;
}
