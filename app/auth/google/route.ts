import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { SITE_URL } from "@/lib/config";
import { createSupabaseRouteClient } from "@/lib/supabase-route";

function getOrigin(request: Request, requestHeaders: Headers) {
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");

  return host ? `${proto}://${host}` : SITE_URL;
}

export async function GET(request: NextRequest) {
  const requestHeaders = await headers();
  const origin = getOrigin(request, requestHeaders);
  const { applyCookies, supabase } = createSupabaseRouteClient(request);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`
    }
  });

  if (error || !data.url) {
    return applyCookies(
      NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error?.message ?? "Could not start Google sign-in.")}`, origin)
      )
    );
  }

  return applyCookies(NextResponse.redirect(data.url));
}
