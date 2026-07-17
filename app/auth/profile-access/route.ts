import { createClient, type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { APP_SCHEMA, getSupabaseAuthCookieName } from "@/lib/config";
import { persistSupabaseSessionCookie } from "@/lib/supabase-session-cookie";
import { safeAuthDestination } from "@/lib/auth-callback-routing";

const allowedTypes = new Set<EmailOtpType>(["magiclink", "invite", "signup", "recovery", "email"]);

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash")?.trim() ?? "";
  const rawType = url.searchParams.get("type")?.trim() ?? "";
  const next=safeAuthDestination(url.searchParams.get("next"),"/my-profile");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !anonKey) {
    return NextResponse.redirect(new URL("/login?error=Profile+access+is+not+configured.", url.origin));
  }
  if (!tokenHash || !allowedTypes.has(rawType as EmailOtpType)) {
    return NextResponse.redirect(new URL("/login?error=This+profile+access+link+is+invalid.", url.origin));
  }

  // Use the plain Supabase client here. Unlike exchangeCodeForSession, verifyOtp
  // needs no locally stored PKCE verifier and is therefore safe across devices.
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  });
  const { data, error } = await authClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: rawType as EmailOtpType
  });
  if (error || !data.session) {
    const message = error?.message ?? "A secure profile session could not be created.";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, url.origin));
  }

  const authenticated = createClient(supabaseUrl, anonKey, {
    db: { schema: APP_SCHEMA },
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } }
  });
  const { error: claimError } = await authenticated.rpc("claim_my_person_profile");
  const { error: emailError } = claimError ? { error: null } : await authenticated.rpc("sync_my_person_email");
  const {error:auditionAccessError}=claimError||emailError?{error:null}:await authenticated.rpc("claim_pending_audition_access");
  const profileError = claimError?.message ?? emailError?.message ?? auditionAccessError?.message ?? null;
  const destination = profileError
    ? `/my-profile?error=${encodeURIComponent(profileError)}`
    : next;
  const response = NextResponse.redirect(new URL(destination, url.origin));
  const cookieName = getSupabaseAuthCookieName(supabaseUrl);
  if (cookieName) {
    persistSupabaseSessionCookie({
      cookieName,
      isSecure: url.protocol === "https:",
      request,
      response,
      session: data.session
    });
  }
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
