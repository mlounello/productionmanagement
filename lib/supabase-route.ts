import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { APP_SCHEMA, getSupabaseAuthCookieName } from "@/lib/config";

type CookieToSet = {
  name: string;
  value: string;
  options: Parameters<NextResponse["cookies"]["set"]>[2];
};

export function createSupabaseRouteClient(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const cookiesToSet: CookieToSet[] = [];

  if (!url || !anon) {
    throw new Error("Missing Supabase environment variables.");
  }

  const cookieName = getSupabaseAuthCookieName(url);
  const isSecure = request.nextUrl.protocol === "https:";

  const supabase = createServerClient(url, anon, {
    ...(cookieName
      ? {
          cookieOptions: {
            name: cookieName,
            path: "/",
            sameSite: "lax",
            secure: isSecure
          }
        }
      : {}),
    db: {
      schema: APP_SCHEMA
    },
    cookies: {
      getAll() {
        const existing = request.cookies.getAll();
        if (cookiesToSet.length === 0) {
          return existing;
        }

        const byName = new Map(existing.map((cookie) => [cookie.name, cookie]));
        cookiesToSet.forEach((cookie) => {
          byName.set(cookie.name, { name: cookie.name, value: cookie.value });
        });

        return Array.from(byName.values());
      },
      setAll(items) {
        items.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        cookiesToSet.push(...items);
      }
    }
  });

  function applyCookies(response: NextResponse) {
    cookiesToSet.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });

    return response;
  }

  return { applyCookies, cookieName, isSecure, supabase };
}
