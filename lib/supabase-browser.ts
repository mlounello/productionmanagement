"use client";

import { createBrowserClient } from "@supabase/ssr";
import { APP_SCHEMA } from "@/lib/config";

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createBrowserClient(url, anon, {
    db: {
      schema: APP_SCHEMA
    }
  });
}
