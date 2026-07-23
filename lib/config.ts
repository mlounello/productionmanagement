export const APP_ID = process.env.APP_ID?.trim() || "production_management";
export const APP_SCHEMA =
  process.env.APP_SCHEMA?.trim() ||
  process.env.NEXT_PUBLIC_APP_SCHEMA?.trim() ||
  "app_production_management";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
export const ENABLE_PLAYBILL_WRITES = process.env.ENABLE_PLAYBILL_WRITES?.trim().toLowerCase() === "true";
export const ENABLE_PLAYBILL_OUTBOX = process.env.ENABLE_PLAYBILL_OUTBOX?.trim().toLowerCase() === "true";
export const ENABLE_BUDGET_WRITES = process.env.ENABLE_BUDGET_WRITES?.trim().toLowerCase() === "true";
export const ENABLE_ROLE_BUDGET_ACCESS_BRIDGE = process.env.ENABLE_ROLE_BUDGET_ACCESS_BRIDGE?.trim().toLowerCase() === "true";
export const ENABLE_GOOGLE_GROUP_SYNC = process.env.ENABLE_GOOGLE_GROUP_SYNC?.trim().toLowerCase() === "true";
export const ENABLE_GOOGLE_GROUP_MEMBERSHIP_CHECK = process.env.ENABLE_GOOGLE_GROUP_MEMBERSHIP_CHECK?.trim().toLowerCase() === "true";
export const ENABLE_GOOGLE_GROUP_AUTO_CREATE = process.env.ENABLE_GOOGLE_GROUP_AUTO_CREATE?.trim().toLowerCase() === "true";
export const ENABLE_GOOGLE_CALENDAR_SYNC = process.env.ENABLE_GOOGLE_CALENDAR_SYNC?.trim().toLowerCase() === "true";
export const GOOGLE_GROUP_DOMAIN = process.env.GOOGLE_GROUP_DOMAIN?.trim().toLowerCase() || "siena.edu";
export const GOOGLE_GROUP_EMAIL_SUFFIX = process.env.GOOGLE_GROUP_EMAIL_SUFFIX?.trim().toLowerCase() ?? "-group";
export const GOOGLE_GROUP_DEFAULT_EXTERNAL_MEMBER_SUPPORT = process.env.GOOGLE_GROUP_DEFAULT_EXTERNAL_MEMBER_SUPPORT?.trim().toLowerCase() === "true";
export const GOOGLE_GROUP_DEFAULT_EXTERNAL_POSTING_SUPPORT = process.env.GOOGLE_GROUP_DEFAULT_EXTERNAL_POSTING_SUPPORT?.trim().toLowerCase() === "true";
export const DISABLE_OUTBOUND_EMAIL = process.env.DISABLE_OUTBOUND_EMAIL?.trim().toLowerCase() !== "false";

export function getSupabaseProjectRef(url: string) {
  try {
    const hostname = new URL(url).hostname;
    const projectRef = hostname.split(".")[0]?.trim();
    return projectRef || null;
  } catch {
    return null;
  }
}

export function getSupabaseAuthCookieName(url: string) {
  const projectRef = getSupabaseProjectRef(url);
  return projectRef ? `sb-${projectRef}-auth-token` : null;
}

export function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getMissingSupabaseEnvVars() {
  return ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"].filter((name) => !process.env[name]);
}
