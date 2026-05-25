import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase-route";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/projects";
  const origin = url.origin;
  const { applyCookies, supabase } = createSupabaseRouteClient(request);

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return applyCookies(
        NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, origin))
      );
    }
  } else {
    const errorDescription =
      url.searchParams.get("error_description") ??
      url.searchParams.get("error") ??
      "Missing authentication code.";
    return applyCookies(
      NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(errorDescription)}`, origin))
    );
  }

  return applyCookies(NextResponse.redirect(new URL(next, origin)));
}
