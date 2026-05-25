import { type NextRequest, NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/lib/supabase-route";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next") || "/projects";
  const origin = url.origin;
  const { applyCookies, supabase } = createSupabaseRouteClient(request);
  const stampCallback = (response: NextResponse) => {
    response.cookies.set("pm_callback_hit", String(Date.now()), {
      path: "/",
      sameSite: "lax",
      secure: url.protocol === "https:",
      maxAge: 60 * 10
    });
    return response;
  };

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return stampCallback(
        applyCookies(NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, origin)))
      );
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "magiclink" | "recovery" | "invite" | "signup" | "email_change" | "email"
    });
    if (error) {
      return stampCallback(
        applyCookies(NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, origin)))
      );
    }
  } else {
    const errorDescription =
      url.searchParams.get("error_description") ??
      url.searchParams.get("error") ??
      "Missing authentication code.";
    return stampCallback(
      applyCookies(NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(errorDescription)}`, origin)))
    );
  }

  return stampCallback(applyCookies(NextResponse.redirect(new URL(next, origin))));
}
