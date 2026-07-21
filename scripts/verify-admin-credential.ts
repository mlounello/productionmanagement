import { createClient } from "@supabase/supabase-js";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import { profileIntakeHmacSecret } from "../lib/profile-intake-secret.ts";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import { elevatedSupabaseConfiguration } from "../lib/supabase-admin-config.ts";

const { url, key, keyType } = elevatedSupabaseConfiguration(process.env);
profileIntakeHmacSecret(process.env);

const schema = process.env.APP_SCHEMA?.trim() || process.env.NEXT_PUBLIC_APP_SCHEMA?.trim() || "app_production_management";
const admin = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  db: { schema },
});

const { error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
if (authError) throw new Error(`Preview Auth-admin check failed: ${authError.message}`);

const { error: databaseError } = await admin.from("people").select("id", { head: true, count: "exact" }).limit(1);
if (databaseError) throw new Error(`Preview app-schema check failed: ${databaseError.message}`);

console.log(`Preview credential checks passed (key type: ${keyType}; Auth admin: ok; ${schema}: ok; intake HMAC: ok).`);
