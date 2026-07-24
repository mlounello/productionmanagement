import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publicitySync = readFileSync(new URL("../lib/publicity-sync.ts", import.meta.url), "utf8");
const reconciliation = readFileSync(new URL("../lib/publicity-sync-reconciliation.ts", import.meta.url), "utf8");
const reminderCron = readFileSync(new URL("../app/api/cron/publicity-reminders/route.ts", import.meta.url), "utf8");

test("publicity approval repairs Playbill assignment dependencies before copying publicity", () => {
  const dependencyIndex = publicitySync.indexOf("syncAssignmentToPlaybillAsSystem");
  const publicityPushIndex = publicitySync.indexOf('rpc("push_publicity_to_playbill"');
  assert.ok(dependencyIndex >= 0);
  assert.ok(publicityPushIndex > dependencyIndex);
  assert.match(publicitySync, /does not have an active role assignment/i);
  assert.match(publicitySync, /playbill_sync_status:\s*"failed"/);
});

test("failed and pending approved publicity receives an automatic retry", () => {
  assert.match(reconciliation, /person_approved/);
  assert.match(reconciliation, /"not_ready", "pending", "failed", "disabled"/);
  assert.match(reconciliation, /syncApprovedPublicityToPlaybill/);
  assert.match(reminderCron, /runPublicitySyncReconciliation/);
});
