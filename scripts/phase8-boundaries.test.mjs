import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const uploadRoute = readFileSync(new URL("../app/api/auditions/files/route.ts", import.meta.url), "utf8");
const downloadRoute = readFileSync(new URL("../app/api/projects/[projectId]/auditions/files/[fileId]/route.ts", import.meta.url), "utf8");
const publicitySync = readFileSync(new URL("../lib/publicity-sync.ts", import.meta.url), "utf8");
const outboxRoute = readFileSync(new URL("../app/api/integrations/playbill/outbox/route.ts", import.meta.url), "utf8");

test("audition uploads use private object storage and retain a database fallback reader", () => {
  assert.match(uploadRoute, /AUDITION_FILE_BUCKET/);
  assert.match(uploadRoute, /\.storage[\s\S]*\.upload/);
  assert.match(uploadRoute, /file_data:\s*null/);
  assert.doesNotMatch(uploadRoute, /upload_public_audition_file/);
  assert.match(downloadRoute, /readAuditionFileBytes/);
});

test("Playbill publicity can switch to the durable outbox without removing the legacy fallback", () => {
  assert.match(publicitySync, /ENABLE_PLAYBILL_OUTBOX/);
  assert.match(publicitySync, /enqueue_playbill_publicity_event/);
  assert.match(publicitySync, /push_publicity_to_playbill/);
});

test("the inbound outbox route requires a direction-specific secret", () => {
  assert.match(outboxRoute, /PLAYBILL_TO_PM_INTEGRATION_SECRET/);
  assert.match(outboxRoute, /process_playbill_publicity_events/);
});
