import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createSupabaseRouteClient } from "@/lib/supabase-route";

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const { applyCookies, supabase } = createSupabaseRouteClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return applyCookies(NextResponse.json({ error: "Sign in before uploading a headshot." }, { status: 401 }));

  const { data: person } = await supabase.from("people").select("id, auth_user_id").eq("id", personId).maybeSingle();
  const { data: staffAllowed } = await supabase.rpc("has_app_role", { allowed_roles: ["admin", "producer", "staff", "faculty"] });
  if (!person || (person.auth_user_id !== user.id && !staffAllowed)) {
    return applyCookies(NextResponse.json({ error: "You do not have permission to update this headshot." }, { status: 403 }));
  }

  const formData = await request.formData();
  const file = formData.get("headshot");
  if (!(file instanceof File)) return applyCookies(NextResponse.json({ error: "Choose a headshot image." }, { status: 400 }));
  if (!ALLOWED_TYPES.has(file.type)) return applyCookies(NextResponse.json({ error: "Use a JPEG, PNG, or WebP image." }, { status: 400 }));
  if (file.size > MAX_SOURCE_BYTES) return applyCookies(NextResponse.json({ error: "The original image must be 15 MB or smaller." }, { status: 400 }));

  try {
    const source = Buffer.from(await file.arrayBuffer());
    let output: Uint8Array = new Uint8Array();
    for (const quality of [84, 76, 68, 60]) {
      output = await sharp(source)
        .rotate()
        .resize(1200, 1200, { fit: "cover", position: "centre" })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      if (output.length <= MAX_OUTPUT_BYTES) break;
    }
    if (output.length > MAX_OUTPUT_BYTES) throw new Error("The image could not be compressed below 3 MB. Try a smaller original.");

    const objectPath = `${personId}/headshot.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("profile-headshots")
      .upload(objectPath, output, { contentType: "image/jpeg", cacheControl: "3600", upsert: true });
    if (uploadError) throw uploadError;

    const { data: publicUrl } = supabase.storage.from("profile-headshots").getPublicUrl(objectPath);
    const versionedUrl = `${publicUrl.publicUrl}?v=${Date.now()}`;
    const { error: profileError } = await supabase.rpc("set_person_headshot", {
      target_person_id: personId,
      new_headshot_url: versionedUrl
    });
    if (profileError) throw profileError;

    return applyCookies(NextResponse.json({ url: versionedUrl, size: output.length, width: 1200, height: 1200 }));
  } catch (error) {
    return applyCookies(NextResponse.json({ error: error instanceof Error ? error.message : "Headshot upload failed." }, { status: 500 }));
  }
}
