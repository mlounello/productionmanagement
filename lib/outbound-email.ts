import { DISABLE_OUTBOUND_EMAIL } from "./config";

export type TemplateVariables = Record<string, string>;

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
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

function assertOutboundEnabled() {
  if (DISABLE_OUTBOUND_EMAIL) throw new Error("Outbound email is disabled.");
}

// Siena Gmail is the single application email provider. Every workflow enters
// the durable queue before Gmail is contacted, so there is no hidden Resend
// fallback and every accepted message can be found in the Siena Sent folder.
export async function sendHtmlEmail(input: HtmlEmailInput, options: { idempotencyKey?: string } = {}) {
  assertOutboundEnabled();
  const { queueAndDeliverHtmlEmail } = await import("./outbound-email-queue");
  return queueAndDeliverHtmlEmail(input, { idempotencyKey: options.idempotencyKey ?? `pm-email-${crypto.randomUUID()}` });
}

export async function sendHtmlEmailBatch(inputs: HtmlEmailInput[], options: { idempotencyKey?: string } = {}) {
  if (!inputs.length) return [];
  if (inputs.length > 100) throw new Error("Email batches cannot contain more than 100 recipients.");
  assertOutboundEnabled();
  const { deliverQueuedEmails, queueHtmlEmail } = await import("./outbound-email-queue");
  const root = options.idempotencyKey ?? `pm-batch-${crypto.randomUUID()}`;
  const jobs = [];
  for (let index = 0; index < inputs.length; index += 1) {
    jobs.push(await queueHtmlEmail(inputs[index], { idempotencyKey: `${root}:${index}` }));
  }
  const results: Array<{ id: string; jobId: string; status: string }> = [];
  const problems: string[] = [];
  for (const job of jobs) {
    const result = job.status === "sent"
      ? job
      : ["failed", "uncertain", "cancelled"].includes(job.status)
        ? job
        : (await deliverQueuedEmails({ jobId: job.id, limit: 1 }))[0] ?? job;
    if (result.status === "sent") results.push({ id: result.provider_message_id ?? result.id, jobId: result.id, status: "sent" });
    else problems.push(`${result.status}: ${result.last_error || "delivery requires review"}`);
  }
  if (problems.length) {
    throw new OutboundEmailError(`${problems.length} Gmail message${problems.length === 1 ? "" : "s"} require delivery review. Every recipient remains recorded in the queue. ${problems[0]}`, 503, jobs.some((job) => job.status === "queued"));
  }
  return results;
}
