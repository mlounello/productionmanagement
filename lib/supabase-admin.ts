import { createClient } from "@supabase/supabase-js";
import { APP_SCHEMA } from "@/lib/config";

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRole) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured for secure profile links.");
  return createClient(url, serviceRole, { auth: { persistSession: false }, db: { schema: APP_SCHEMA } });
}
