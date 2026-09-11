import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
// @ts-expect-error Node's test runner uses the built-in TypeScript loader.
import { auditionCalendarAggregateStatus } from "../lib/audition-calendar-status.ts";

test("distinguishes complete, partial, failed, and skipped calendar outcomes", () => {
  assert.equal(auditionCalendarAggregateStatus(2, 0), "synced");
  assert.equal(auditionCalendarAggregateStatus(1, 1), "partial");
  assert.equal(auditionCalendarAggregateStatus(0, 2), "failed");
  assert.equal(auditionCalendarAggregateStatus(0, 0), "skipped");
});

test("calendar bridge uses deterministic slot keys before enabling retries", () => {
  const sync = fs.readFileSync(new URL("../lib/audition-calendar-sync.ts", import.meta.url), "utf8");
  const bridge = fs.readFileSync(new URL("../integrations/apps-script/google-groups-membership-check.gs", import.meta.url), "utf8");
  assert.match(sync, /externalKey:`audition-slot:\$\{slot\.id\}`/);
  assert.match(sync, /retrySafe:capabilities\.idempotentUpsert/);
  assert.match(bridge, /calendar_capabilities/);
  assert.match(bridge, /PM_CALENDAR_KEY/);
  assert.match(bridge, /bridgeVersion: 2/);
});

test("audition workspace exposes per-booking status and individual resync", () => {
  const page = fs.readFileSync(new URL("../app/projects/[projectId]/auditions/page.tsx", import.meta.url), "utf8");
  const actions = fs.readFileSync(new URL("../app/projects/[projectId]/auditions/actions.ts", import.meta.url), "utf8");
  assert.match(page, /Calendar partially synced/);
  assert.match(page, /Resync this applicant/);
  assert.match(page, /google_calendar_sync_status/);
  assert.match(actions, /syncAuditionApplicantCalendarAction/);
  assert.match(actions, /bridge_version/);
});
