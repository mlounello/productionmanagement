import "server-only";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { assertSienaGmailIdentity, GMAIL_SEND_SCOPE, openGmailSecret } from "@/lib/gmail-security";

export async function requireGmailOwner() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_user_role");
  if (error || data !== "owner") throw new Error("Only the Production Management owner can manage the Siena email connection.");
  return user;
}

export function gmailConfiguration() {
  const clientId = process.env.PM_GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.PM_GMAIL_CLIENT_SECRET?.trim();
  const encryptionKey = process.env.PM_GMAIL_ENCRYPTION_KEY?.trim();
  const site = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
  if (site.protocol !== "https:" && !(site.protocol === "http:" && site.hostname === "localhost")) throw new Error("Gmail requires a secure application site URL.");
  if (!clientId || !clientSecret || !encryptionKey || encryptionKey.length < 32) throw new Error("Set PM_GMAIL_CLIENT_ID, PM_GMAIL_CLIENT_SECRET, and PM_GMAIL_ENCRYPTION_KEY before connecting Gmail.");
  return { clientId, clientSecret, encryptionKey, redirectUri: `${site.origin}/api/integrations/gmail/callback`, origin: site.origin };
}

export async function googleTokenRequest(body: URLSearchParams) {
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.access_token !== "string") throw new Error("Google authorization failed or expired. Reconnect the Siena account; no message was sent.");
  return data as { access_token: string; refresh_token?: string; scope?: string };
}

export async function verifyGmailIdentity(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error("Google could not verify the connected account. Reconnect Siena Gmail.");
  const identity = await response.json();
  assertSienaGmailIdentity(identity);
}

export async function connectedGmailAccessToken() {
  const config = gmailConfiguration();
  const { data, error } = await createSupabaseAdminClient().from("gmail_connection").select("encrypted_refresh_token,scopes,email").eq("id", true).maybeSingle();
  if (error) throw new Error("Gmail connection storage is unavailable. Check that the Gmail migration has been applied.");
  if (!data || !data.scopes.includes(GMAIL_SEND_SCOPE)) throw new Error("Connect Siena Gmail and approve the send-email permission first.");
  let refreshToken: string;
  try { refreshToken = openGmailSecret(data.encrypted_refresh_token, config.encryptionKey, "refresh-token"); }
  catch { throw new Error("The saved Gmail connection cannot be unlocked. Check the encryption key or reconnect."); }
  const token = await googleTokenRequest(new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }));
  if (token.scope && !token.scope.split(/\s+/).includes(GMAIL_SEND_SCOPE)) throw new Error("Google has not granted permission to send email. Reconnect and approve Gmail sending.");
  await verifyGmailIdentity(token.access_token);
  return token.access_token;
}
