import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditionRoomControl } from "@/components/audition-room-control";
import { ProjectWorkspaceNav } from "@/components/project-workspace-nav";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function text(value: unknown) { return Array.isArray(value) ? value.join(", ") : String(value ?? ""); }
function slotLabel(row: { audition_submission_slots?: Array<{ audition_slots: { starts_at: string; audition_sessions: { title: string } | null } | null }> }) {
  const booking = row.audition_submission_slots?.[0]?.audition_slots;
  return booking ? `${booking.audition_sessions?.title ?? "Audition"} · ${new Date(booking.starts_at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })}` : "";
}

export default async function AuditionControlPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireUser();
  const { projectId } = await params;
  const supabase = await createSupabaseServerClient();
  const [{ data: project }, { data: allowed }, { data: submissions }, { data: roles }, { data: reviews }, { data: reads }] = await Promise.all([
    supabase.from("projects").select("id,title").eq("id", projectId).maybeSingle(),
    supabase.rpc("can_manage_auditions", { target_project_id: projectId }),
    supabase.from("audition_submissions").select("id,answers,applicant_email,audition_status,cancelled_at,people(full_name,preferred_name,email),audition_submission_slots(audition_slots(starts_at,audition_sessions(title)))").eq("project_id", projectId).is("cancelled_at", null).order("submitted_at"),
    supabase.from("project_roles").select("id,name").eq("project_id", projectId).eq("role_group", "cast").order("name"),
    supabase.from("audition_reviews").select("submission_id,recommendation").eq("reviewer_user_id", user.id),
    supabase.from("audition_character_reads").select("submission_id,project_role_id"),
  ]);
  if (!project || !allowed) notFound();
  const currentReviews = new Map((reviews ?? []).filter((row) => row).map((row) => [String(row.submission_id), String(row.recommendation ?? "")]));
  const readMap = new Map<string, string[]>();
  for (const read of reads ?? []) readMap.set(String(read.submission_id), [...(readMap.get(String(read.submission_id)) ?? []), String(read.project_role_id)]);
  const applicants = (submissions ?? []).map((row) => {
    const person = row.people as unknown as { full_name?: string; preferred_name?: string; email?: string } | null;
    return {
      id: String(row.id),
      name: person?.preferred_name || person?.full_name || text((row.answers as Record<string, unknown>)?.full_name) || "Applicant",
      email: person?.email || String(row.applicant_email ?? ""),
      auditionStatus: String(row.audition_status),
      recommendation: currentReviews.get(String(row.id)) ?? "",
      readRoleIds: readMap.get(String(row.id)) ?? [],
      slotLabel: slotLabel(row as never)
    };
  });

  return <div className="page audition-control-page">
    <div className="page-header"><div><p className="eyebrow">{project.title}</p><h1>Audition Room</h1><p className="muted">Live check-in, character reads, and reviewer decisions. Every change saves immediately.</p></div><div className="top-actions"><Link className="button" href={`/projects/${projectId}/communications#compose`}>Prepare audition emails</Link><Link className="button secondary" href={`/projects/${projectId}/auditions#review`}>Full applicant review</Link><Link className="button secondary" href={`/projects/${projectId}/overview`}>Project overview</Link></div></div>
    <ProjectWorkspaceNav projectId={projectId} active="auditions"/>
    <AuditionRoomControl projectId={projectId} applicants={applicants} roles={(roles ?? []).map((role) => ({ id: String(role.id), name: String(role.name) }))}/>
  </div>;
}
