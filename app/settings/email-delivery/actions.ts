"use server";

import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { connectedGmailAccessToken, gmailConfiguration, requireGmailOwner } from "@/lib/gmail-connection";
import { buildGmailTestMessage, GMAIL_SEND_SCOPE, sealGmailSecret, SIENA_GMAIL_ADDRESS } from "@/lib/gmail-security";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { brandProductionManagementEmail } from "@/lib/email-branding";
import { DISABLE_OUTBOUND_EMAIL } from "@/lib/config";

function back(kind: string, message: string): never {
  revalidatePath("/settings/email-delivery");
  redirect(`/settings/email-delivery?${kind}=${encodeURIComponent(message)}`);
}

export async function connectGmailAction() {
  const user = await requireGmailOwner();
  let destination: string;
  try {
    const config = gmailConfiguration();
    const state = randomBytes(32).toString("base64url"), verifier = randomBytes(48).toString("base64url");
    (await cookies()).set("pm-gmail-oauth", sealGmailSecret(JSON.stringify({ state, verifier, userId: user.id, expiresAt: Date.now() + 600_000 }), config.encryptionKey, "oauth-state"), {
      httpOnly: true, secure: config.origin.startsWith("https:"), sameSite: "lax", path: "/api/integrations/gmail/callback", maxAge: 600
    });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: `openid email ${GMAIL_SEND_SCOPE}`, state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", access_type: "offline", prompt: "consent", login_hint: SIENA_GMAIL_ADDRESS }).toString();
    destination = url.toString();
  } catch (error) { back("error", error instanceof Error ? error.message : "Could not start the Google connection."); }
  redirect(destination);
}

export async function checkGmailAction() {
  await requireGmailOwner();
  let message = "";
  try { await connectedGmailAccessToken(); }
  catch (error) { message = error instanceof Error ? error.message : "Google connection check failed."; }
  const { error } = await createSupabaseAdminClient().from("gmail_connection").update({ last_checked_at: new Date().toISOString(), last_check_error: message || null }).eq("id", true);
  if (error) back("error", "Could not save the connection check. Confirm the Gmail migration is installed.");
  back(message ? "error" : "success", message || "Account authorization verified. No email was sent; use the test button to verify Gmail delivery.");
}

export async function sendGmailTestAction(form: FormData) {
  const user = await requireGmailOwner();
  if (DISABLE_OUTBOUND_EMAIL) back("error", "Outbound email is disabled. Enable it before explicitly sending a test.");
  const id = String(form.get("testId") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) back("error", "Reload this page before requesting a test.");
  const admin = createSupabaseAdminClient();
  const { error: claimError } = await admin.from("gmail_connection_tests").insert({ id, requested_by: user.id });
  if (claimError) back("error", claimError.code === "23505" ? "This test was already requested. Review its result below before sending another." : "Could not record the test safely. Check the Gmail migration; no message was sent.");
  let status = "failed", providerMessageId: string | null = null, message = "";
  try {
    const token = await connectedGmailAccessToken();
    const raw = buildGmailTestMessage(brandProductionManagementEmail("<h1>Siena email connection test</h1><p>This message came from your Siena account through Production Management.</p><p>No cast offers were sent. Live email delivery has not been switched.</p>"));
    // Once the request begins, a timeout or 5xx cannot prove that Gmail did not send it.
    status = "uncertain";
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw }), signal: AbortSignal.timeout(25_000) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500 && response.status !== 408) status = "failed";
      throw new Error(`Gmail returned ${response.status}. Check account permissions or sending limits before trying again.`);
    }
    if (!payload.id) throw new Error("Gmail did not return a message receipt.");
    providerMessageId = String(payload.id); status = "sent";
  } catch (error) { message = status === "uncertain" ? "Delivery outcome is uncertain. Check your Siena Sent folder before sending another test; this request will not be retried automatically." : error instanceof Error ? error.message : "The test could not be sent."; }
  const { error } = await admin.from("gmail_connection_tests").update({ status, provider_message_id: providerMessageId, error_message: message || null }).eq("id", id);
  if (error) back("error", "Could not save the email receipt. Check your Siena Sent folder before trying again.");
  if (status === "sent") {
    const { error: receiptError } = await admin.from("gmail_connection").update({ last_test_sent_at: new Date().toISOString() }).eq("id", true);
    if (receiptError) back("error", "Test sent; the test log has its receipt, but connection status could not be updated.");
  }
  back(status === "sent" ? "success" : "error", message || `One test email sent to ${SIENA_GMAIL_ADDRESS}. Check its appearance in your inbox.`);
}
