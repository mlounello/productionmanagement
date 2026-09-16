import { DISABLE_OUTBOUND_EMAIL } from "./config";
import { brandProductionManagementEmail, PRODUCTION_MANAGEMENT_FROM } from "./email-branding";
import { isResendQuotaError, resendQuotaMessage, resendRetryDelayMs, shouldRetryResend, type ResendErrorPayload } from "./resend-rate-limit";

export type TemplateVariables = Record<string, string>;

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export function renderTemplate(template: string, variables: TemplateVariables, html = false) {
  return template.replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_match, key: string) => html ? escapeHtml(variables[key] ?? "") : variables[key] ?? "");
}

export type HtmlEmailInput = { to: string; subject: string; html: string };

export class OutboundEmailError extends Error {
  constructor(message: string, readonly status: number, readonly retryable: boolean) {
    super(message);
    this.name = "OutboundEmailError";
  }
}

const configuredRequestsPerSecond = Number(process.env.RESEND_MAX_REQUESTS_PER_SECOND ?? "4");
const requestsPerSecond = Number.isFinite(configuredRequestsPerSecond) ? Math.min(4, Math.max(1, configuredRequestsPerSecond)) : 4;
const minimumRequestIntervalMs = Math.ceil(1000 / requestsPerSecond);
const configuredRetries = Number(process.env.RESEND_MAX_RETRIES ?? "5");
const maxRetries = Number.isFinite(configuredRetries) ? Math.min(8, Math.max(0, Math.floor(configuredRetries))) : 5;
let providerRequestChain: Promise<unknown> = Promise.resolve();
let nextProviderRequestAt = 0;

function outboundProvider() {
  const provider = (process.env.OUTBOUND_EMAIL_PROVIDER ?? "resend").trim().toLowerCase();
  if (provider !== "resend" && provider !== "gmail") throw new Error("OUTBOUND_EMAIL_PROVIDER must be either resend or gmail. No fallback was attempted.");
  return provider;
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function providerCredentials() {
  if (DISABLE_OUTBOUND_EMAIL) throw new Error("Outbound email is disabled.");
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("Resend email credentials are not configured.");
  return { apiKey };
}

async function requestResend(path: string, body: unknown, idempotencyKey: string) {
  const { apiKey } = providerCredentials();
  const run = async () => {
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const pacingDelay = Math.max(0, nextProviderRequestAt - Date.now());
      if (pacingDelay) await wait(pacingDelay);
      nextProviderRequestAt = Date.now() + minimumRequestIntervalMs;
      const response = await fetch(`https://api.resend.com${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey, "User-Agent": "Siena-Production-Management/1.0" },
        body: JSON.stringify(body)
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown> & ResendErrorPayload;
      if (response.ok) return payload;
      const retryable = shouldRetryResend(response.status, payload);
      if (retryable && attempt < maxRetries) {
        await wait(resendRetryDelayMs(response.headers, attempt));
        continue;
      }
      const quotaMessage = isResendQuotaError(payload) ? resendQuotaMessage(payload) : "";
      const providerMessage = String(payload.message ?? `Email provider failed (${response.status}).`);
      const suffix = retryable ? ` Resend remained unavailable after ${attempt + 1} attempts; the recipient was preserved for retry.` : "";
      throw new OutboundEmailError(quotaMessage || `${providerMessage}${suffix}`, response.status, retryable);
    }
    throw new OutboundEmailError("Email delivery could not be completed; the recipient was preserved for retry.", 503, true);
  };
  const result = providerRequestChain.then(run, run);
  providerRequestChain = result.catch(() => undefined);
  return result;
}

export async function sendHtmlEmail(input: HtmlEmailInput, options: { idempotencyKey?: string } = {}) {
  if (outboundProvider() === "gmail") {
    if (DISABLE_OUTBOUND_EMAIL) throw new Error("Outbound email is disabled.");
    const { queueAndDeliverHtmlEmail } = await import("./outbound-email-queue");
    return queueAndDeliverHtmlEmail(input, { idempotencyKey: options.idempotencyKey ?? `pm-email-${crypto.randomUUID()}` });
  }
  providerCredentials();
  const payload = await requestResend("/emails", {
    from: PRODUCTION_MANAGEMENT_FROM,
    to: [input.to],
    subject: input.subject,
    html: brandProductionManagementEmail(input.html)
  }, options.idempotencyKey ?? `pm-email-${crypto.randomUUID()}`);
  return { id: String(payload.id ?? "") };
}

export async function sendHtmlEmailBatch(inputs: HtmlEmailInput[], options: { idempotencyKey?: string } = {}) {
  if (!inputs.length) return [];
  if (inputs.length > 100) throw new Error("Email batches cannot contain more than 100 recipients.");
  if (outboundProvider() === "gmail") {
    if (DISABLE_OUTBOUND_EMAIL) throw new Error("Outbound email is disabled.");
    const { deliverQueuedEmails, queueHtmlEmail } = await import("./outbound-email-queue");
    const root = options.idempotencyKey ?? `pm-batch-${crypto.randomUUID()}`;
    // Persist every recipient before attempting any provider request. A problem
    // with recipient one must not silently discard recipients two through N.
    const jobs = [];
    for (let index = 0; index < inputs.length; index += 1) jobs.push(await queueHtmlEmail(inputs[index], { idempotencyKey: `${root}:${index}` }));
    const results: Array<{ id: string; jobId: string; status: string }> = [];
    const problems: string[] = [];
    for (const job of jobs) {
      const result = job.status === "sent" ? job : ["failed","uncertain","cancelled"].includes(job.status) ? job : (await deliverQueuedEmails({ jobId: job.id, limit: 1 }))[0] ?? job;
      if (result.status === "sent") results.push({ id: result.provider_message_id ?? result.id, jobId: result.id, status: "sent" });
      else problems.push(`${result.status}: ${result.last_error || "delivery requires review"}`);
    }
    if (problems.length) throw new OutboundEmailError(`${problems.length} Gmail message${problems.length === 1 ? "" : "s"} require delivery review. Every recipient remains recorded in the queue. ${problems[0]}`, 503, jobs.some((job) => job.status === "queued"));
    return results;
  }
  providerCredentials();
  const body = inputs.map((input) => ({
    from: PRODUCTION_MANAGEMENT_FROM,
    to: [input.to],
    subject: input.subject,
    html: brandProductionManagementEmail(input.html)
  }));
  const payload = await requestResend("/emails/batch", body, options.idempotencyKey ?? `pm-batch-${crypto.randomUUID()}`);
  const data = Array.isArray(payload.data) ? payload.data as Array<Record<string, unknown>> : [];
  if (data.length !== inputs.length) throw new OutboundEmailError("Resend returned an incomplete batch response. Recipient statuses were preserved for review.", 502, true);
  return data.map((item) => ({ id: String(item.id ?? "") }));
}
