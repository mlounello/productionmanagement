import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAuthCookieName } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase-server";

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string) {
  try {
    const stripped = value.startsWith("base64-") ? value.slice("base64-".length) : value;
    const normalized = stripped.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const expectedCookieName = getSupabaseAuthCookieName(supabaseUrl);
  const authCookies = allCookies.filter((cookie) => cookie.name.includes("auth-token"));
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();

  return NextResponse.json({
    ok: true,
    logged_in: Boolean(user),
    user: user ? { id: user.id, email: user.email ?? null } : null,
    session_present: Boolean(session),
    expected_cookie_name: expectedCookieName,
    cookie_names: allCookies.map((cookie) => cookie.name),
    auth_cookie_diagnostics: authCookies.map((cookie) => {
      const decoded = decodeBase64Url(cookie.value);
      return {
        name: cookie.name,
        length: cookie.value.length,
        preview: cookie.value.slice(0, 24),
        parsed_raw_json: Boolean(safeJsonParse(cookie.value)),
        decoded_length: decoded?.length ?? 0,
        parsed_decoded_json: Boolean(decoded ? safeJsonParse(decoded) : null)
      };
    }),
    user_error: userError?.message ?? null,
    session_error: sessionError?.message ?? null
  });
}
