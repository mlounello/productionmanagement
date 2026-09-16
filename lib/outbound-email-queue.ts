import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { connectedGmailAccessToken } from "@/lib/gmail-connection";
import { buildGmailMessage } from "@/lib/gmail-security";
import { brandProductionManagementEmail } from "@/lib/email-branding";

export type QueuedEmail = { id: string; status: string; provider_message_id: string | null; last_error: string | null };
export class GmailQueueError extends Error {
  constructor(message: string, readonly jobId: string, readonly deliveryStatus: string, readonly retryable: boolean) { super(message); this.name = "GmailQueueError"; }
}

function normalized(input: { to: string; subject: string; html: string }) {
  const to = input.to.trim().toLowerCase(), subject = input.subject.trim(), html = brandProductionManagementEmail(input.html);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("A valid recipient email is required.");
  if (!subject || /[\r\n]/.test(subject)) throw new Error("A valid single-line email subject is required.");
  return { to, subject, html };
}

export async function queueHtmlEmail(input: { to: string; subject: string; html: string }, options: { idempotencyKey: string; projectId?: string; personId?: string }) {
  const message = normalized(input);
  const contentHash = createHash("sha256").update(JSON.stringify(message)).digest("hex");
  const admin = createSupabaseAdminClient();
  const id = crypto.randomUUID();
  const { data, error } = await admin.from("outbound_email_jobs").insert({ id, idempotency_key: options.idempotencyKey, content_hash: contentHash, project_id: options.projectId ?? null, person_id: options.personId ?? null, to_email: message.to, subject: message.subject, html_body: message.html }).select("id,status,provider_message_id,last_error,content_hash").single();
  if (!error && data) return data as QueuedEmail & { content_hash: string };
  if (error?.code !== "23505") throw new Error(error?.message || "Email could not be safely queued.");
  const existing = await admin.from("outbound_email_jobs").select("id,status,provider_message_id,last_error,content_hash").eq("idempotency_key", options.idempotencyKey).maybeSingle();
  if (existing.error || !existing.data) throw new Error("The existing email request could not be verified.");
  if (existing.data.content_hash !== contentHash) throw new Error("This email key was already used for different content. Nothing was sent.");
  return existing.data as QueuedEmail & { content_hash: string };
}

function rateLimited(status: number, payload: Record<string, unknown>) {
  const text = JSON.stringify(payload).toLowerCase();
  return status === 429 || (status === 403 && (text.includes("ratelimitexceeded") || text.includes("userratelimitexceeded")));
}

async function saveResult(id: string, values: Record<string, unknown>) {
  const { error } = await createSupabaseAdminClient().from("outbound_email_jobs").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error("The email provider result could not be saved. Do not resend until the delivery log is reviewed.");
}

export async function deliverQueuedEmails(options: { jobId?: string; limit?: number } = {}) {
  const admin = createSupabaseAdminClient();
  // A terminated worker might have contacted Gmail. Never blindly reclaim it.
  await admin.from("outbound_email_jobs").update({ status: "uncertain", last_error: "Delivery worker stopped before recording a receipt. Check Siena Sent before retrying.", updated_at: new Date().toISOString() }).eq("status", "processing").lt("locked_at", new Date(Date.now() - 10 * 60_000).toISOString());
  const dailyLimitRaw = Number(process.env.PM_GMAIL_MAX_MESSAGES_PER_24_HOURS ?? "500");
  const dailyLimit = Number.isFinite(dailyLimitRaw) ? Math.max(1, Math.min(1500, Math.floor(dailyLimitRaw))) : 500;
  const { data, error } = await admin.rpc("claim_outbound_email_jobs", { batch_limit: Math.max(1, Math.min(25, options.limit ?? 10)), target_job: options.jobId ?? null, daily_limit: dailyLimit });
  if (error) throw new Error("The Gmail delivery queue is not ready. Apply the delivery migration before sending.");
  const results: QueuedEmail[] = [];
  let nextRequestAt = 0;
  for (const job of data ?? []) {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    nextRequestAt = Date.now() + 1100;
    let requestStarted = false;
    try {
      const accessToken = await connectedGmailAccessToken();
      const raw = buildGmailMessage({ to: job.to_email, subject: job.subject, html: job.html_body, messageId: `pm-${job.id}@mlounello.com` });
      requestStarted = true;
      const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw }), signal: AbortSignal.timeout(25_000) });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (response.ok && payload.id) {
        await saveResult(job.id, { status: "sent", provider_message_id: String(payload.id), sent_at: new Date().toISOString(), last_error: null });
        results.push({ id: job.id, status: "sent", provider_message_id: String(payload.id), last_error: null });
      } else if (rateLimited(response.status, payload)) {
        const retryMinutes = Math.min(360, 2 ** Math.min(8, Number(job.attempts)));
        const message = "Gmail rate-limited this message. It remains queued for a paced retry.";
        await saveResult(job.id, { status: "queued", next_attempt_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(), last_error: message });
        results.push({ id: job.id, status: "queued", provider_message_id: null, last_error: message });
      } else if (response.status >= 500) {
        const message = `Gmail returned ${response.status}; delivery could not be proven. Check Siena Sent before retrying.`;
        await saveResult(job.id, { status: "uncertain", last_error: message });
        results.push({ id: job.id, status: "uncertain", provider_message_id: null, last_error: message });
      } else {
        const message = `Gmail rejected this message (${response.status}). Review the connection, recipient, and account policy.`;
        await saveResult(job.id, { status: "failed", last_error: message });
        results.push({ id: job.id, status: "failed", provider_message_id: null, last_error: message });
      }
    } catch (failure) {
      const uncertain = requestStarted;
      const message = uncertain ? "Gmail delivery outcome is uncertain. Check Siena Sent before retrying." : failure instanceof Error ? failure.message : "Gmail delivery failed before sending.";
      await saveResult(job.id, { status: uncertain ? "uncertain" : "failed", last_error: message });
      results.push({ id: job.id, status: uncertain ? "uncertain" : "failed", provider_message_id: null, last_error: message });
    }
  }
  return results;
}

export async function queueAndDeliverHtmlEmail(input: { to: string; subject: string; html: string }, options: { idempotencyKey: string; projectId?: string; personId?: string }) {
  const job = await queueHtmlEmail(input, options);
  if (job.status === "sent") return { id: job.provider_message_id ?? job.id, jobId: job.id, status: "sent" };
  if (["failed","uncertain","cancelled"].includes(job.status)) throw new GmailQueueError(job.last_error || `Email is ${job.status}.`, job.id, job.status, false);
  const [result] = await deliverQueuedEmails({ jobId: job.id, limit: 1 });
  if (!result) throw new GmailQueueError("Email remains queued because the configured daily delivery limit has been reached.", job.id, "queued", true);
  if (result.status !== "sent") throw new GmailQueueError(result.last_error || `Email is ${result.status}.`, job.id, result.status, result.status === "queued");
  return { id: result.provider_message_id ?? result.id, jobId: result.id, status: "sent" };
}

export async function requeueKnownFailedEmail(jobId: string) {
  const { data, error } = await createSupabaseAdminClient().from("outbound_email_jobs").update({ status: "queued", next_attempt_at: new Date().toISOString(), last_error: "Manual retry requested after a confirmed rejection.", updated_at: new Date().toISOString() }).eq("id", jobId).eq("status", "failed").select("id").maybeSingle();
  if (error || !data) throw new Error("Only a confirmed failed message can be retried. Uncertain messages require review of Siena Sent first.");
}
