type AdminEnvironment = Record<string, string | undefined>;

function decodeLegacyJwtPayload(key: string): Record<string, unknown> | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;

  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hostedProjectRef(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.endsWith(".supabase.co") ? hostname.split(".")[0] ?? null : null;
  } catch {
    return null;
  }
}

export function elevatedSupabaseConfiguration(env: AdminEnvironment) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new Error("The server-side Supabase admin credential is not configured.");
  }

  if (key.startsWith("sb_secret_")) {
    if (key.length < 24) throw new Error("The configured Supabase secret key is malformed.");
    return { url, key, keyType: "secret" as const };
  }

  const payload = decodeLegacyJwtPayload(key);
  if (payload?.role !== "service_role") {
    throw new Error("The configured Supabase credential is not a secret or service-role key.");
  }

  const expectedRef = hostedProjectRef(url);
  if (expectedRef && payload.ref !== expectedRef) {
    throw new Error("The Supabase service-role key belongs to a different project.");
  }

  return { url, key, keyType: "legacy_service_role" as const };
}
