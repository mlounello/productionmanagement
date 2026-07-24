import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseRouteClient } from "@/lib/supabase-route";

const bodySchema = z.union([
  z.object({ auditionStatus: z.enum(["registered", "checked_in", "auditioned", "no_show"]) }),
  z.object({ recommendation: z.enum(["", "callback", "consider", "cast", "not_cast", "discuss"]) }),
  z.object({ roleId: z.string().uuid(), read: z.boolean() })
]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ projectId: string; submissionId: string }> }) {
  const { projectId, submissionId } = await params;
  const { applyCookies, supabase } = createSupabaseRouteClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return applyCookies(NextResponse.json({ error: "Sign in to update the audition room." }, { status: 401 }));
  const { data: allowed } = await supabase.rpc("can_manage_auditions", { target_project_id: projectId });
  if (!allowed) return applyCookies(NextResponse.json({ error: "You do not have audition-room access for this project." }, { status: 403 }));
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return applyCookies(NextResponse.json({ error: "Invalid audition-room update." }, { status: 400 }));

  const { data: submission } = await supabase.from("audition_submissions").select("id").eq("id", submissionId).eq("project_id", projectId).maybeSingle();
  if (!submission) return applyCookies(NextResponse.json({ error: "Applicant submission not found." }, { status: 404 }));

  if ("auditionStatus" in parsed.data) {
    const { error } = await supabase.from("audition_submissions").update({
      audition_status: parsed.data.auditionStatus,
      checked_in_at: parsed.data.auditionStatus === "checked_in" ? new Date().toISOString() : null
    }).eq("id", submissionId).eq("project_id", projectId);
    if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  } else if ("recommendation" in parsed.data) {
    const { error } = await supabase.from("audition_reviews").upsert({
      submission_id: submissionId,
      reviewer_user_id: user.id,
      recommendation: parsed.data.recommendation,
      rubric: {}
    }, { onConflict: "submission_id,reviewer_user_id" });
    if (error) return applyCookies(NextResponse.json({ error: error.message }, { status: 500 }));
  } else {
    const { data: role } = await supabase.from("project_roles").select("id").eq("id", parsed.data.roleId).eq("project_id", projectId).eq("role_group", "cast").maybeSingle();
    if (!role) return applyCookies(NextResponse.json({ error: "That character is not a cast role in this project." }, { status: 400 }));
    const result = parsed.data.read
      ? await supabase.from("audition_character_reads").upsert({ submission_id: submissionId, project_role_id: parsed.data.roleId, marked_by: user.id })
      : await supabase.from("audition_character_reads").delete().eq("submission_id", submissionId).eq("project_role_id", parsed.data.roleId);
    if (result.error) return applyCookies(NextResponse.json({ error: result.error.message }, { status: 500 }));
  }

  return applyCookies(NextResponse.json({ ok: true }));
}
