import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ProjectWorkspaceNav } from "@/components/project-workspace-nav";
import { CastingWorkspace } from "@/components/casting-workspace";
import type { CastingDraft } from "@/lib/casting-drafts";
import type { CastingOffer } from "@/lib/casting-offers";
import { CastingOfferTracker } from "@/components/casting-offer-tracker";

export const dynamic = "force-dynamic";

// Read every page instead of silently losing actors at the API row limit.
async function allRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const result = await fetchPage(from, from + 499);
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return { data: rows, error: null };
  }
}

export default async function CastingPage({ params }: { params: Promise<{ projectId: string }> }) {
  await requireUser();
  const { projectId } = await params;
  const supabase = await createSupabaseServerClient();
  const [{ data: project }, projectAccess, appAccess] = await Promise.all([
    supabase.from("projects").select("id,title").eq("id", projectId).maybeSingle(),
    supabase.rpc("has_project_role", { target_project_id: projectId, allowed_roles: ["project_manager", "producer"] }),
    supabase.rpc("has_app_role", { allowed_roles: ["admin", "producer"] }),
  ]);
  if (!project) notFound();
  if (!projectAccess.data && !appAccess.data) return <div className="page"><h1>Casting & Offers</h1><p>Only project managers and producers can prepare casting offers.</p></div>;
  const [drafts, people, roles, assignments, applicants, offers] = await Promise.all([
    allRows((from, to) => supabase.from("casting_drafts").select("*").eq("project_id", projectId).order("created_at").order("id").range(from, to)),
    allRows((from, to) => supabase.from("people").select("id,full_name,email,person_type").order("full_name").order("id").range(from, to)),
    allRows((from, to) => supabase.from("project_roles").select("id,name,role_group,allows_multiple_assignments,assignment_capacity").eq("project_id", projectId).order("name").order("id").range(from, to)),
    allRows((from, to) => supabase.from("role_assignments").select("person_id,role_id,status").eq("project_id", projectId).order("id").range(from, to)),
    allRows((from, to) => supabase.from("audition_submissions").select("person_id").eq("project_id", projectId).is("cancelled_at", null).order("id").range(from, to)),
    allRows((from, to) => supabase.from("casting_offers").select("id,draft_id,project_id,draft_revision,public_token,status,snapshot,answers,expires_at,responded_at,released_at,onboarding_status,onboarding_error").eq("project_id", projectId).order("created_at").order("id").range(from, to)),
  ]);
  const error = [drafts, people, roles, assignments, applicants].find((result) => result.error)?.error;
  return <div className="page">
    <header className="page-header"><div><p className="eyebrow">{project.title}</p><h1>Casting & Offers</h1><p className="muted">Prepare the company and review each actor’s proposed role.</p></div><Link className="button secondary" href={`/projects/${projectId}/onboarding`}>Project agreements & schedules</Link></header>
    <ProjectWorkspaceNav projectId={projectId} active="casting" />
    {offers.error ? <p className="setup-warning">Agreement tracking needs the casting-offer database update. Draft preparation is still available.</p> : <CastingOfferTracker projectId={projectId} offers={(offers.data ?? []) as CastingOffer[]} releaseEnabled={process.env.ENABLE_CASTING_RELEASE === "true"}/>}
    {error ? <section className="panel"><h2>Casting is not available yet</h2><p role="alert">{drafts.error?.code === "PGRST205" || drafts.error?.code === "42P01" ? "The casting database update needs to be installed. Existing actor records and workflows remain available." : error.message}</p></section> : <CastingWorkspace projectId={projectId} projectTitle={project.title} drafts={(drafts.data ?? []) as CastingDraft[]} people={people.data ?? []} roles={roles.data ?? []} assignments={assignments.data ?? []} applicantIds={(applicants.data ?? []).map((row) => String(row.person_id))} />}
  </div>;
}
