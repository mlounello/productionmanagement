import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const outbound = readFileSync(new URL("../lib/outbound-email.ts", import.meta.url), "utf8");
const publicityActions = readFileSync(new URL("../app/projects/[projectId]/publicity/actions.ts", import.meta.url), "utf8");
const deliveryPage = readFileSync(new URL("../app/settings/email-delivery/page.tsx", import.meta.url), "utf8");

test("all shared application mail enters the Siena Gmail queue", () => {
  assert.match(outbound, /queueAndDeliverHtmlEmail/);
  assert.match(outbound, /queueHtmlEmail/);
  assert.match(outbound, /deliverQueuedEmails/);
  assert.doesNotMatch(outbound, /api\.resend\.com|RESEND_API_KEY|OUTBOUND_EMAIL_PROVIDER/);
});

test("requesting publicity approval sends a secure email instead of only changing status", () => {
  assert.match(publicityActions, /mode: "approval_request"/);
  assert.match(publicityActions, /sendPublicityReminder/);
  assert.match(publicityActions, /Approval request sent through Siena Gmail/);
});

test("email delivery settings report Gmail as the sole provider", () => {
  assert.match(deliveryPage, /Siena Gmail is the only application email provider/);
  assert.match(deliveryPage, /Active provider: <strong>Siena Gmail<\/strong>/);
});
