import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseRouteClient } from "@/lib/supabase-route";

function safeFilename(name: string) {
  const base = name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .toLowerCase();
  return `${base || "profile"}-headshot.jpg`;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const { applyCookies, supabase } = createSupabaseRouteClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return applyCookies(NextResponse.json({ error: "Sign in before downloading a headshot." }, { status: 401 }));
  }

  const [{ data: person }, { data: staffAllowed }] = await Promise.all([
    supabase.from("people").select("id, auth_user_id, full_name, publicity_headshot_url").eq("id", personId).maybeSingle(),
    supabase.rpc("has_app_role", { allowed_roles: ["admin", "producer", "staff", "faculty"] })
  ]);
  if (!person || (person.auth_user_id !== user.id && !staffAllowed)) {
    return applyCookies(NextResponse.json({ error: "You do not have permission to download this headshot." }, { status: 403 }));
  }
  if (!person.publicity_headshot_url) {
    return applyCookies(NextResponse.json({ error: "This profile does not have a headshot." }, { status: 404 }));
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from("profile-headshots").download(`${personId}/headshot.jpg`);
  if (error || !data) {
    return applyCookies(NextResponse.json({
      error: "The stored headshot file could not be found. Upload the headshot again, then retry the download."
    }, { status: 404 }));
  }

  const bytes = new Uint8Array(await data.arrayBuffer());
  return applyCookies(new NextResponse(bytes, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${safeFilename(person.full_name)}"`,
      "Content-Length": String(bytes.byteLength),
      "Content-Type": data.type || "image/jpeg"
    }
  }));
}
