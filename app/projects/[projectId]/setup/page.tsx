import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { loadProjectReadiness, type ReadinessSection } from "@/lib/project-readiness";
import { ProjectReadinessChecklist } from "@/components/project-readiness-checklist";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { StatusBadge } from "@/components/ui/status-badge";
import { completeProjectSetupAction, goToProjectSetupStepAction, saveProjectWorkflowAction } from "./actions";

export const dynamic = "force-dynamic";

const stepOrder = ["workflow", "roles", "onboarding", "communications", "integrations", "review"] as const;
type Step = typeof stepOrder[number];
const stepLabels: Record<Step, string> = { workflow: "1. Workflow", roles: "2. Roles", onboarding: "3. Onboarding", communications: "4. Communications", integrations: "5. Integrations", review: "6. Review" };
const groups = [
  ["cast", "Cast"], ["creative_team", "Creative Team"], ["directorial_team", "Directorial Team"], ["production_team", "Production Team"],
  ["administrative", "Administrative"], ["front_of_house", "Front of House"], ["music_band", "Band"], ["crew", "Crew"],
  ["designer", "Designers"], ["department_head", "Department Heads"], ["staff", "Staff"], ["guest_artist", "Guest Artists"]
] as const;
type Preferences = {
  setup_status: string; current_step: Step; uses_role_acceptance: boolean; uses_google_groups: boolean; uses_propared: boolean;
  uses_playbill: boolean; uses_publicity: boolean; uses_auditions: boolean; uses_budget: boolean; selected_role_groups: string[];
};

function SetupSection({ section }: { section: ReadinessSection }) {
  return <section className="panel workspace-section"><div className="section-heading"><div><h2>{section.title}</h2><p className="muted">{section.description}</p></div></div><div className="compact-list">{section.items.map((item) => <Link className="compact-row" href={item.href ?? "#"} key={item.id}><div><strong>{item.title}</strong><span>{item.detail}</span></div><StatusBadge status={item.state} label={item.state === "attention" ? "Needs setup" : item.state} /></Link>)}</div></section>;
}

function StepButtons({ projectId, previous, next }: { projectId: string; previous?: Step; next?: Step }) {
  return <div className="setup-step-actions">{previous ? <form action={goToProjectSetupStepAction}><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="nextStep" value={previous}/><button className="button secondary" type="submit">Back</button></form> : <span/>}{next ? <form action={goToProjectSetupStepAction}><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="nextStep" value={next}/><button type="submit">Continue</button></form> : null}</div>;
}

export default async function ProjectSetupPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams?: Promise<{ step?: string; error?: string }> }) {
  await requireUser();
  const { projectId } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [{ data: project }, { data: saved }, { data: roles }, { count: guestArtistCount }] = await Promise.all([
    supabase.from("projects").select("id,title,project_type,starts_on,ends_on").eq("id", projectId).maybeSingle(),
    supabase.from("project_setup_preferences").select("*").eq("project_id", projectId).maybeSingle(),
    supabase.from("project_roles").select("id,role_group").eq("project_id", projectId),
    supabase.from("role_assignments").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("is_guest_artist", true).not("status", "in", "(declined,withdrawn)")
  ]);
  if (!project) notFound();
  const defaults: Preferences = { setup_status: "in_progress", current_step: "workflow", uses_role_acceptance: true, uses_google_groups: true, uses_propared: true, uses_playbill: true, uses_publicity: true, uses_auditions: true, uses_budget: true, selected_role_groups: groups.slice(0, 7).map(([value]) => value) };
  const preferences = { ...defaults, ...(saved as Preferences | null ?? {}) };
  const requestedStep = stepOrder.includes(query?.step as Step) ? query?.step as Step : preferences.current_step;
  const roleCounts = new Map<string, number>();
  for (const role of roles ?? []) roleCounts.set(String(role.role_group), (roleCounts.get(String(role.role_group)) ?? 0) + 1);
  const readiness = await loadProjectReadiness(projectId, preferences.selected_role_groups, guestArtistCount ?? 0);
  const reviewSections = readiness.sections.map((readinessSection) => readinessSection.id !== "setup" ? readinessSection : ({ ...readinessSection, items: readinessSection.items.map((item) => item.state === "ignored" ? item : ({ ...item, state: "ready" as const, detail: "All guided questions have been reviewed. Finish below to record initial setup as complete." })) }));
  const reviewRequired = reviewSections.flatMap((readinessSection) => readinessSection.items).filter((item) => item.state !== "optional" && item.state !== "ignored");
  const reviewReadiness = { sections: reviewSections, required: reviewRequired.length, ready: reviewRequired.filter((item) => item.state === "ready").length, attention: reviewRequired.filter((item) => item.state !== "ready").length };
  const section = (id: string) => readiness.sections.find((item) => item.id === id)!;

  return <div className="page workspace-page setup-workflow">
    <div className="page-header"><div><p className="eyebrow">Guided Project Setup</p><h1>{project.title}</h1><p className="muted">Choose the workflows this production will use, configure each one, and verify the connections before adding participants.</p></div><div className="top-actions"><StatusBadge status={preferences.setup_status === "complete" ? "ready" : "pending"} label={preferences.setup_status === "complete" ? "Initial setup complete" : "Setup in progress"}/><Link className="button secondary" href={`/projects/${projectId}/overview`}>Exit to Overview</Link></div></div>
    <FeedbackBanner error={query?.error}/>
    <nav className="setup-step-nav" aria-label="Project setup steps">{stepOrder.map((step) => <Link aria-current={requestedStep === step ? "step" : undefined} className={requestedStep === step ? "active" : ""} href={`/projects/${projectId}/setup?step=${step}`} key={step}>{stepLabels[step]}</Link>)}</nav>

    {requestedStep === "workflow" ? <section className="panel workspace-section"><div className="section-heading"><div><p className="eyebrow">Step 1</p><h2>What will this project use?</h2><p className="muted">These choices decide which setup checks are required. They can be changed later without deleting information.</p></div></div><form action={saveProjectWorkflowAction} className="stacked-form"><input type="hidden" name="projectId" value={projectId}/><div className="choice-grid">
      <label className="checkbox-card"><input type="checkbox" name="usesRoleAcceptance" defaultChecked={preferences.uses_role_acceptance}/><span><strong>Student role acceptance</strong><small>Send cast or crew agreements when students are selected.</small></span></label>
      <label className="checkbox-card"><input type="checkbox" name="usesAuditions" defaultChecked={preferences.uses_auditions}/><span><strong>Auditions and interest forms</strong><small>Collect submissions and build or connect profiles.</small></span></label>
      <label className="checkbox-card"><input type="checkbox" name="usesGoogleGroups" defaultChecked={preferences.uses_google_groups}/><span><strong>Google Groups</strong><small>Check membership for each selected role group.</small></span></label>
      <label className="checkbox-card"><input type="checkbox" name="usesPropared" defaultChecked={preferences.uses_propared}/><span><strong>Propared welcome links</strong><small>Send role-group Production Book links after onboarding.</small></span></label>
      <label className="checkbox-card"><input type="checkbox" name="usesPlaybill" defaultChecked={preferences.uses_playbill}/><span><strong>Playbill integration</strong><small>Sync vacant roles, assignments, bios, and headshots.</small></span></label>
      <label className="checkbox-card"><input type="checkbox" name="usesPublicity" defaultChecked={preferences.uses_publicity}/><span><strong>Publicity profiles</strong><small>Collect show bios, headshots, approvals, and reminders.</small></span></label>
      <label className="checkbox-card"><input type="checkbox" name="usesBudget" defaultChecked={preferences.uses_budget}/><span><strong>Theatre Budget guest artists</strong><small>Link guest artists when financial processing is needed.</small></span></label>
    </div><fieldset><legend>Role groups used by this project</legend><p className="muted">These groups drive separate email, Google Group, Propared, acceptance, and Playbill routing.</p><div className="choice-grid">{groups.map(([value, label]) => <label className="checkbox-card" key={value}><input type="checkbox" name="roleGroup" value={value} defaultChecked={preferences.selected_role_groups.includes(value)}/><span>{label}</span></label>)}</div></fieldset><button type="submit">Save choices &amp; continue</button></form></section> : null}

    {requestedStep === "roles" ? <><section className="panel workspace-section"><div className="section-heading"><div><p className="eyebrow">Step 2</p><h2>Build the project’s role structure</h2><p className="muted">Create vacant roles now. People can be assigned later, and one person may hold multiple roles.</p></div><Link className="button" href={`/projects/${projectId}/roles`}>Open Roles &amp; Assignments</Link></div><div className="setup-group-grid">{preferences.selected_role_groups.map((group) => <div className="setup-group-card" key={group}><strong>{groups.find(([value]) => value === group)?.[1] ?? group.replace(/_/g," ")}</strong><span>{roleCounts.get(group) ?? 0} role{roleCounts.get(group) === 1 ? "" : "s"} created</span></div>)}</div></section><StepButtons projectId={projectId} previous="workflow" next="onboarding"/></> : null}

    {requestedStep === "onboarding" ? <>{preferences.uses_role_acceptance ? <SetupSection section={section("acceptance")}/> : <section className="panel"><h2>Student role acceptance is not used</h2><p className="muted">You can enable it under Workflow if this project will cast or select students.</p></section>}<div className="panel"><div className="section-heading"><div><h2>Dates and agreement language</h2><p className="muted">Add actual rehearsal, tech, performance, and strike dates and review the separate cast and crew agreements.</p></div>{preferences.uses_role_acceptance ? <Link className="button" href={`/projects/${projectId}/onboarding`}>Configure onboarding</Link> : null}</div></div><StepButtons projectId={projectId} previous="roles" next="communications"/></> : null}

    {requestedStep === "communications" ? <><SetupSection section={section("email")}/>{(preferences.uses_google_groups || preferences.uses_propared || preferences.uses_role_acceptance) ? <SetupSection section={section("groups")}/> : null}<div className="panel"><p className="muted">Email templates are reusable. Each role group can choose its own role-acceptance and welcome defaults.</p><div className="top-actions"><Link className="button secondary" href="/settings/email-templates">Open template library</Link><Link className="button" href={`/projects/${projectId}/google-groups`}>Configure role groups</Link></div></div><StepButtons projectId={projectId} previous="onboarding" next="integrations"/></> : null}

    {requestedStep === "integrations" ? <><SetupSection section={section("integrations")}/>{preferences.uses_auditions ? <section className="panel"><div className="section-heading"><div><h2>Audition and technical-interest intake</h2><p className="muted">Build public forms after the project foundation is ready. Submissions create or securely connect people profiles.</p></div><Link className="button" href={`/projects/${projectId}/auditions`}>Configure auditions</Link></div></section> : null}<StepButtons projectId={projectId} previous="communications" next="review"/></> : null}

    {requestedStep === "review" ? <><ProjectReadinessChecklist readiness={reviewReadiness} projectId={projectId}/><section className="panel workspace-section"><div className="section-heading"><div><p className="eyebrow">Final Review</p><h2>{reviewReadiness.attention ? `${reviewReadiness.attention} item${reviewReadiness.attention === 1 ? "" : "s"} still need attention` : "All required checks are ready"}</h2><p className="muted">You may finish initial setup with warnings. The same live checklist stays on Overview and will continue to catch configuration changes.</p></div></div><div className="setup-step-actions"><form action={goToProjectSetupStepAction}><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="nextStep" value="integrations"/><button className="button secondary" type="submit">Back</button></form><form action={completeProjectSetupAction}><input type="hidden" name="projectId" value={projectId}/><button type="submit">{reviewReadiness.attention ? "Finish setup with warnings" : "Finish project setup"}</button></form></div></section></> : null}
  </div>;
}
