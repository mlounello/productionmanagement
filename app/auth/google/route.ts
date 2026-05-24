import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase-server";

function getOrigin(request: Request, requestHeaders: Headers) {
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");

  return host ? `${proto}://${host}` : SITE_URL;
}

export async function GET(request: Request) {
  const requestHeaders = await headers();
  const origin = getOrigin(request, requestHeaders);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`
    }
  });

  if (error || !data.url) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error?.message ?? "Could not start Google sign-in.")}`, origin)
    );
  }

  return NextResponse.redirect(data.url);
}
