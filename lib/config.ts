export const APP_ID = process.env.APP_ID?.trim() || "production_management";
export const APP_SCHEMA =
  process.env.APP_SCHEMA?.trim() ||
  process.env.NEXT_PUBLIC_APP_SCHEMA?.trim() ||
  "app_production_management";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

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
