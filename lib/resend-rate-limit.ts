export type ResendErrorPayload = { name?: unknown; type?: unknown; message?: unknown };

const quotaErrors = new Set(["daily_quota_exceeded", "monthly_quota_exceeded"]);

export function resendErrorType(payload: ResendErrorPayload) {
  return String(payload.name ?? payload.type ?? "").trim().toLowerCase();
}

export function isResendQuotaError(payload: ResendErrorPayload) {
  return quotaErrors.has(resendErrorType(payload));
}

export function shouldRetryResend(status: number, payload: ResendErrorPayload) {
  if (isResendQuotaError(payload)) return false;
  return status === 429 || status === 409 || status >= 500;
}

function secondsHeader(value: string | null) {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

export function resendRetryDelayMs(headers: Headers, attempt: number) {
  const instructed = secondsHeader(headers.get("retry-after")) ?? secondsHeader(headers.get("ratelimit-reset"));
  if (instructed !== null) return Math.max(250, Math.ceil(instructed));
  return Math.min(10_000, 500 * 2 ** Math.max(0, attempt));
}

export function resendQuotaMessage(payload: ResendErrorPayload) {
  const type = resendErrorType(payload);
  if (type === "daily_quota_exceeded") return "Resend's daily email quota has been reached. Unsent recipients were preserved; retry after the quota resets or the plan is upgraded.";
  if (type === "monthly_quota_exceeded") return "Resend's monthly email quota has been reached. Unsent recipients were preserved; retry after the quota resets or the plan is upgraded.";
  return "";
}
