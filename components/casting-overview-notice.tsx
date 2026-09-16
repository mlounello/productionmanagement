import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { StatusBadge } from "@/components/ui/status-badge";

export async function CastingOverviewNotice({ projectId }: { projectId: string }) {
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: notices }] = await Promise.all([
    supabase.from("casting_offers").select("id,status,released_at,onboarding_status", { count: "exact" }).eq("project_id", projectId).in("status", ["accepted", "declined", "discussion"]),
    supabase.from("project_notifications").select("id,title,message,action_path,email_status,email_error,created_at").eq("project_id", projectId).eq("status", "unread").order("created_at", { ascending: false }).limit(20)
  ]);
  // Optional module: older deployments without this migration keep working.
  if (error && !notices?.length) return null;
  const offerRows = data ?? [];
  const waiting = offerRows.filter((row) => row.status === "accepted" && !row.released_at).length;
  const discussion = offerRows.filter((row) => row.status === "discussion").length;
  const declined = offerRows.filter((row) => row.status === "declined").length;
  const attention = offerRows.filter((row) => row.released_at && row.onboarding_status !== "complete").length;
  if (!waiting && !discussion && !declined && !attention && !notices?.length) return null;
  return <>{waiting || discussion || declined || attention ? <Link className="notification-row notification-action" href={`/projects/${projectId}/casting`}><StatusBadge status={attention ? "failed" : "needs_review"} label="Casting"/><div><strong>Casting responses</strong><span>{waiting} accepted awaiting release · {discussion} discussion requested · {declined} declined{attention ? ` · ${attention} onboarding follow-up` : ""}</span></div><span aria-hidden="true">→</span></Link> : null}
    {(notices ?? []).map((notice) => <Link className="notification-row notification-action" href={notice.action_path} key={notice.id}><StatusBadge status={notice.email_status === "failed" || notice.email_status === "uncertain" ? "failed" : "needs_review"} label={notice.email_status === "sent" ? "Emailed" : "Needs review"}/><div><strong>{notice.title}</strong><span>{notice.message}{notice.email_status === "failed" || notice.email_status === "uncertain" ? ` Email: ${notice.email_error || notice.email_status}.` : ""}</span></div><span aria-hidden="true">→</span></Link>)}
  </>;
}
