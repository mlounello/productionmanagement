import Link from "next/link";
import { randomUUID } from "node:crypto";
import { connectGmailAction, checkGmailAction, sendGmailTestAction } from "./actions";
import { gmailConfiguration, requireGmailOwner } from "@/lib/gmail-connection";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { SIENA_GMAIL_FROM } from "@/lib/gmail-security";
import { DISABLE_OUTBOUND_EMAIL } from "@/lib/config";
import { PendingSubmitButton } from "@/components/pending-submit-button";

export const dynamic = "force-dynamic";
export default async function EmailDeliveryPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  await requireGmailOwner();
  const query = await searchParams;
  let configurationError = "";
  try { gmailConfiguration(); } catch (error) { configurationError = error instanceof Error ? error.message : "Google setup is incomplete."; }
  const admin = createSupabaseAdminClient();
  const [{ data: connection, error }, { data: tests, error: testsError }] = await Promise.all([
    admin.from("gmail_connection").select("email,connected_at,last_checked_at,last_check_error,last_test_sent_at").eq("id", true).maybeSingle(),
    admin.from("gmail_connection_tests").select("id,created_at,status,error_message,provider_message_id").order("created_at", { ascending: false }).limit(10)
  ]);
  return <div className="page workspace-page"><div className="page-header"><div><p className="eyebrow">Owner settings</p><h1>Email Delivery</h1><p className="muted">Connect and test your Siena account without changing current application emails.</p></div><Link className="button secondary" href="/settings/email-templates">Email templates</Link></div>
    {query.error && <p role="alert" className="error">{query.error}</p>}{query.success && <p role="status">{query.success}</p>}
    <section className="card stacked-form"><h2>Siena Gmail setup</h2><p>Planned sender: <strong>{SIENA_GMAIL_FROM}</strong></p><p>Live delivery still uses the existing provider. This page only connects Google and sends a test to Mike when explicitly requested. It does not send cast offers or start onboarding.</p>
      {configurationError && <p role="alert">{configurationError}</p>}{(error || testsError) && <p role="alert">Gmail storage is not ready. Apply the Gmail connection migration before connecting. Existing email delivery is unaffected.</p>}
      <p>{connection ? `Connected: ${connection.email}` : "Not connected"}</p>
      {connection?.last_checked_at && <p>Last account check: {connection.last_checked_at}{connection.last_check_error ? ` — ${connection.last_check_error}` : " — authorization verified"}</p>}
      {connection?.last_test_sent_at && <p>Last test accepted by Gmail: {connection.last_test_sent_at}. Confirm receipt and appearance in your inbox.</p>}
      <form action={connectGmailAction}><PendingSubmitButton pendingLabel="Opening Google…" disabled={Boolean(configurationError || error || testsError)}>{connection ? "Reconnect Siena Gmail" : "Connect Siena Gmail"}</PendingSubmitButton></form>
      {connection && <><form action={checkGmailAction}><PendingSubmitButton pendingLabel="Checking authorization…" className="secondary" disabled={Boolean(configurationError)}>Check authorization (no email)</PendingSubmitButton></form><form action={sendGmailTestAction}><input type="hidden" name="testId" value={randomUUID()}/><PendingSubmitButton pendingLabel="Sending your test…" disabled={Boolean(configurationError || DISABLE_OUTBOUND_EMAIL)}>Send one test to mlounello@siena.edu</PendingSubmitButton></form></>}
      {DISABLE_OUTBOUND_EMAIL && <p>Outbound email is disabled; test sending is also disabled.</p>}
    </section><section className="card"><h2>Recent connection tests</h2><p>Uncertain or pending requests are never automatically resent. Check your Siena Sent folder before requesting another test.</p><ul>{tests?.map(test => <li key={test.id}><strong>{test.status}</strong> · {test.created_at}{test.error_message ? ` — ${test.error_message}` : ""}{test.provider_message_id ? ` · Gmail receipt ${test.provider_message_id}` : ""}</li>)}</ul>{!tests?.length && <p>No tests recorded.</p>}</section>
  </div>;
}
