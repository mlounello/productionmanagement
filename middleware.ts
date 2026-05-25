import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { APP_SCHEMA, getSupabaseAuthCookieName } from "@/lib/config";

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    return NextResponse.next({ request });
  }

  const requestUrl = request.nextUrl.clone();
  const hasAuthCallbackParams =
    requestUrl.searchParams.has("code") ||
    (requestUrl.searchParams.has("token_hash") && requestUrl.searchParams.has("type"));
  if (hasAuthCallbackParams && requestUrl.pathname !== "/auth/callback") {
    requestUrl.pathname = "/auth/callback";
    return NextResponse.redirect(requestUrl);
  }

  let response = NextResponse.next({ request });
  const cookieName = getSupabaseAuthCookieName(url);
  const supabase = createServerClient(url, anon, {
    ...(cookieName ? { cookieOptions: { name: cookieName } } : {}),
    db: {
      schema: APP_SCHEMA
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
