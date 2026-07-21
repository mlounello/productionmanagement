import { createClient } from "@supabase/supabase-js";
import { APP_SCHEMA } from "@/lib/config";
import { elevatedSupabaseConfiguration } from "@/lib/supabase-admin-config";

export function createSupabaseAdminClient() {
  const { url, key } = elevatedSupabaseConfiguration(process.env);
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    db: { schema: APP_SCHEMA },
  });
}
