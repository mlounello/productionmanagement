import assert from "node:assert/strict";
import test from "node:test";
// Node's built-in TypeScript loader requires the extension; the app compiler
// resolves this module normally through its bundler.
// @ts-expect-error TypeScript disallows .ts imports unless allowImportingTsExtensions is enabled.
import { isResendQuotaError, resendRetryDelayMs, shouldRetryResend } from "../lib/resend-rate-limit.ts";

test("retries per-second rate limits and provider failures", () => {
  assert.equal(shouldRetryResend(429, { name: "rate_limit_exceeded" }), true);
  assert.equal(shouldRetryResend(503, { name: "application_error" }), true);
});

test("does not repeatedly retry daily or monthly quota exhaustion", () => {
  assert.equal(isResendQuotaError({ name: "daily_quota_exceeded" }), true);
  assert.equal(shouldRetryResend(429, { name: "monthly_quota_exceeded" }), false);
});

test("honors Resend retry headers", () => {
  assert.equal(resendRetryDelayMs(new Headers({ "retry-after": "2" }), 0), 2000);
  assert.equal(resendRetryDelayMs(new Headers(), 2), 2000);
});
