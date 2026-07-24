import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { createSupabaseRouteClient } from "@/lib/supabase-route";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SOURCE = 15 * 1024 * 1024;

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { applyCookies, supabase } = createSupabaseRouteClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return applyCookies(NextResponse.json({ error: "Sign in before uploading a poster." }, { status: 401 }));
  const [{ data: projectRole }, { data: appRole }] = await Promise.all([
    supabase.rpc("has_project_role", { target_project_id: projectId, allowed_roles: ["project_manager", "producer"] }),
    supabase.rpc("has_app_role", { allowed_roles: ["admin", "producer"] })
  ]);
  if (!projectRole && !appRole) return applyCookies(NextResponse.json({ error: "Only project managers and producers can change the show poster." }, { status: 403 }));
  const formData = await request.formData();
  const file = formData.get("poster");
  if (!(file instanceof File) || !ALLOWED.has(file.type) || file.size > MAX_SOURCE) {
    return applyCookies(NextResponse.json({ error: "Choose a JPEG, PNG, or WebP poster no larger than 15 MB." }, { status: 400 }));
  }
  try {
    const output = await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize(1800, 2700, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
    const admin = createSupabaseAdminClient();
    const objectPath = `${projectId}/poster.jpg`;
    const upload = await admin.storage.from("show-posters").upload(objectPath, output, { contentType: "image/jpeg", cacheControl: "3600", upsert: true });
    if (upload.error) throw upload.error;
    const publicUrl = admin.storage.from("show-posters").getPublicUrl(objectPath).data.publicUrl;
    const versionedUrl = `${publicUrl}?v=${Date.now()}`;
    const projectUpdate = await admin.from("projects").update({ poster_image_url: versionedUrl }).eq("id", projectId);
    if (projectUpdate.error) throw projectUpdate.error;

    let warning = "";
    const { data: link } = await admin.from("external_links").select("external_id").eq("local_entity_type", "project").eq("local_entity_id", projectId).eq("external_app", "playbill").eq("external_table", "shows").maybeSingle();
    if (link?.external_id) {
      const playbill = admin.schema("app_playbill");
      const { data: show, error: showError } = await playbill.from("shows").select("program_id").eq("id", link.external_id).maybeSingle();
      if (showError) warning = `Poster saved in Production Management, but Playbill could not be read: ${showError.message}`;
      else if (!show?.program_id) warning = "Poster saved in Production Management. The linked Playbill show does not have a program yet.";
      else {
        const { error: syncError } = await playbill.from("programs").update({ poster_image_url: versionedUrl }).eq("id", show.program_id);
        if (syncError) warning = `Poster saved in Production Management, but Playbill could not receive it: ${syncError.message}`;
      }
    }
    return applyCookies(NextResponse.json({ url: versionedUrl, warning }));
  } catch (error) {
    return applyCookies(NextResponse.json({ error: error instanceof Error ? error.message : "Poster upload failed." }, { status: 500 }));
  }
}
