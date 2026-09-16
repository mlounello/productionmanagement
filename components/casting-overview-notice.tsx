import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function CastingOverviewNotice({ projectId }: { projectId: string }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("casting_offers").select("id,status,released_at,onboarding_status", { count: "exact" }).eq("project_id", projectId).in("status", ["accepted", "declined", "discussion"]);
  // Optional module: older deployments without this migration keep working.
  if (error || !data?.length) return null;
  const waiting = data.filter((row) => row.status === "accepted" && !row.released_at).length;
  const discussion = data.filter((row) => row.status === "discussion").length;
  const declined = data.filter((row) => row.status === "declined").length;
  const attention = data.filter((row) => row.released_at && row.onboarding_status !== "complete").length;
  if (!waiting && !discussion && !declined && !attention) return null;
  return <Link className="notification-row notification-action" href={`/projects/${projectId}/casting`}><div><strong>Casting responses</strong><span>{waiting} accepted awaiting release · {discussion} discussion requested · {declined} declined{attention ? ` · ${attention} onboarding follow-up` : ""}</span></div><span aria-hidden="true">→</span></Link>;
}
