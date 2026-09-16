import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { gmailConfiguration, googleTokenRequest, verifyGmailIdentity } from "@/lib/gmail-connection";
import { GMAIL_SEND_SCOPE, openGmailSecret, sealGmailSecret, SIENA_GMAIL_ADDRESS, validateGmailState, type GmailOAuthState } from "@/lib/gmail-security";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const jar = await cookies();
  const saved = jar.get("pm-gmail-oauth")?.value;
  jar.set("pm-gmail-oauth", "", { path: "/api/integrations/gmail/callback", maxAge: 0 });
  // Never use a caller-supplied redirect destination or include tokens/provider bodies in errors.
  let origin = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").origin;
  let message = "", success = false;
  try {
    const config = gmailConfiguration(); origin = config.origin;
    const user = await getCurrentUser();
    if (!user) throw new Error("Sign in as the owner and start the Gmail connection again.");
    const { data: role, error: roleError } = await (await createSupabaseServerClient()).rpc("get_user_role");
    if (roleError || role !== "owner") throw new Error("Only the owner can connect Siena Gmail.");
    let state: GmailOAuthState;
    try { state = JSON.parse(openGmailSecret(saved ?? "", config.encryptionKey, "oauth-state")); }
    catch { throw new Error("The Google connection request expired or is invalid. Start again from Email Delivery."); }
    if (!validateGmailState(state, request.nextUrl.searchParams.get("state") ?? "", user.id)) throw new Error("The Google connection request expired or is invalid. Start again from Email Delivery.");
    if (request.nextUrl.searchParams.has("error")) throw new Error("Google permission was not granted. Your existing email setup has not changed.");
    const code = request.nextUrl.searchParams.get("code");
    if (!code) throw new Error("Google did not return an authorization code.");
    const token = await googleTokenRequest(new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, code, code_verifier: state.verifier, grant_type: "authorization_code" }));
    const scopes = (token.scope ?? "").split(/\s+/);
    if (!scopes.includes(GMAIL_SEND_SCOPE) || !token.refresh_token) throw new Error("Google did not grant persistent Gmail sending access. Reconnect and approve the requested permissions.");
    await verifyGmailIdentity(token.access_token);
    const { error } = await createSupabaseAdminClient().from("gmail_connection").upsert({ id: true, email: SIENA_GMAIL_ADDRESS, encrypted_refresh_token: sealGmailSecret(token.refresh_token, config.encryptionKey, "refresh-token"), scopes, connected_by: user.id, connected_at: new Date().toISOString(), last_checked_at: new Date().toISOString(), last_check_error: null, last_test_sent_at: null });
    if (error) throw new Error("Could not save the connection. Confirm the Gmail migration is installed. Existing actor data and email delivery are unchanged.");
    success = true; message = "Siena Gmail connected. Send a test to yourself below. Live email delivery is unchanged.";
  } catch (error) { message = error instanceof Error && !["TypeError", "AbortError", "TimeoutError"].includes(error.name) ? error.message : "Google connection could not be completed. Try again from Email Delivery."; }
  return NextResponse.redirect(`${origin}/settings/email-delivery?${success ? "success" : "error"}=${encodeURIComponent(message)}`);
}
