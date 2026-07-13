import { type NextRequest, NextResponse } from "next/server";
import { persistSupabaseSessionCookie } from "@/lib/supabase-session-cookie";
import { createSupabaseRouteClient } from "@/lib/supabase-route";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const requestedNext = url.searchParams.get("next") || "/projects";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/projects";
  const origin = url.origin;
  const { applyCookies, cookieName, isSecure, supabase } = createSupabaseRouteClient(request);
  const stampCallback = (
    response: NextResponse,
    status: {
      cookieNames?: string[];
      error?: string | null;
      hasCode: boolean;
      hasSession?: boolean;
      hasTokenHash: boolean;
      manualCookiePersisted?: boolean;
      ok: boolean;
      sessionCookieChunks?: number;
    }
  ) => {
    response.cookies.set("pm_callback_hit", String(Date.now()), {
      path: "/",
      sameSite: "lax",
      secure: url.protocol === "https:",
      maxAge: 60 * 10
    });
    response.cookies.set("pm_callback_status", JSON.stringify(status), {
      path: "/",
      sameSite: "lax",
      secure: url.protocol === "https:",
      maxAge: 60 * 10
    });
    return response;
  };
  const prepareProfile = async () => {
    if (!next.startsWith("/my-profile")) return null;
    const { error: claimError } = await supabase.rpc("claim_my_person_profile");
    if (claimError) return claimError.message;
    const { error: emailError } = await supabase.rpc("sync_my_person_email");
    return emailError?.message ?? null;
  };

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return stampCallback(
        applyCookies(NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, origin))),
        {
          error: error.message,
          hasCode: true,
          hasSession: Boolean(data?.session),
          hasTokenHash: false,
          ok: false
        }
      );
    }
    const profileError = await prepareProfile();
    const destination = profileError ? `/my-profile?error=${encodeURIComponent(profileError)}` : next;
    const response = applyCookies(NextResponse.redirect(new URL(destination, origin)));
    const persisted =
      cookieName && data?.session
        ? persistSupabaseSessionCookie({
            cookieName,
            isSecure,
            request,
            response,
            session: data.session
          })
        : null;
    return stampCallback(response, {
      cookieNames: persisted?.cookieNames,
      error: null,
      hasCode: true,
      hasSession: Boolean(data?.session),
      hasTokenHash: false,
      manualCookiePersisted: Boolean(persisted),
      ok: Boolean(data?.session),
      sessionCookieChunks: persisted?.chunkCount
    });
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "magiclink" | "recovery" | "invite" | "signup" | "email_change" | "email"
    });
    if (error) {
      return stampCallback(
        applyCookies(NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, origin))),
        {
          error: error.message,
          hasCode: false,
          hasSession: Boolean(data?.session),
          hasTokenHash: true,
          ok: false
        }
      );
    }
    const profileError = await prepareProfile();
    const destination = profileError ? `/my-profile?error=${encodeURIComponent(profileError)}` : next;
    const response = applyCookies(NextResponse.redirect(new URL(destination, origin)));
    const persisted =
      cookieName && data?.session
        ? persistSupabaseSessionCookie({
            cookieName,
            isSecure,
            request,
            response,
            session: data.session
          })
        : null;
    return stampCallback(response, {
      cookieNames: persisted?.cookieNames,
      error: null,
      hasCode: false,
      hasSession: Boolean(data?.session),
      hasTokenHash: true,
      manualCookiePersisted: Boolean(persisted),
      ok: Boolean(data?.session),
      sessionCookieChunks: persisted?.chunkCount
    });
  } else {
    const errorDescription =
      url.searchParams.get("error_description") ??
      url.searchParams.get("error") ??
      "Missing authentication code.";
    return stampCallback(
      applyCookies(NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(errorDescription)}`, origin))),
      {
        error: errorDescription,
        hasCode: false,
        hasTokenHash: Boolean(tokenHash),
        ok: false
      }
    );
  }
}
