import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { APP_SCHEMA } from "@/lib/config";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createServerClient(url, anon, {
    db: {
      schema: APP_SCHEMA
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(items) {
        try {
          items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot always write cookies; middleware refreshes sessions.
        }
      }
    }
  });
}
