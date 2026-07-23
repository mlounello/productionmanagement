import { NextRequest, NextResponse } from "next/server";
import { readAuditionFileBytes } from "@/lib/audition-file-storage";
import { createSupabaseRouteClient } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string; fileId: string }> }) {
  const { projectId, fileId } = await params;
  const { supabase, applyCookies } = createSupabaseRouteClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return applyCookies(NextResponse.json({ error: "Sign in required." }, { status: 401 }));
  const { data: allowed } = await supabase.rpc("can_review_auditions", { target_project_id: projectId });
  if (!allowed) return applyCookies(NextResponse.json({ error: "Audition review access required." }, { status: 403 }));
  const { data, error } = await supabase
    .from("audition_files")
    .select("file_name, content_type, file_data, storage_bucket, storage_path, sha256, audition_submissions!inner(project_id)")
    .eq("id", fileId)
    .eq("audition_submissions.project_id", projectId)
    .single();
  if (error || !data) return applyCookies(NextResponse.json({ error: "File not found." }, { status: 404 }));
  try {
    const bytes = await readAuditionFileBytes(data);
    return applyCookies(new NextResponse(bytes, { headers: { "Content-Type": String(data.content_type || "application/octet-stream"), "Content-Disposition": `inline; filename="${String(data.file_name).replace(/["\r\n]/g, "")}"`, "Cache-Control": "private, no-store" } }));
  } catch {
    return applyCookies(NextResponse.json({ error: "The file failed its storage integrity check." }, { status: 503 }));
  }
}
