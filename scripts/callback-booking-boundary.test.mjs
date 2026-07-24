import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/202607241100_callback_self_booking.sql", import.meta.url), "utf8");
const communications = await readFile(new URL("../app/projects/[projectId]/communications/actions.ts", import.meta.url), "utf8");
const callbackPage = await readFile(new URL("../app/callbacks/[token]/page.tsx", import.meta.url), "utf8");
const defaults = await readFile(new URL("../lib/auditions.ts", import.meta.url), "utf8");
const auditionActions = await readFile(new URL("../app/projects/[projectId]/auditions/actions.ts", import.meta.url), "utf8");

test("required Siena audition questions are required in defaults and existing forms", () => {
  assert.match(defaults, /field_key: "intimacy_comfort".*required: true/);
  assert.match(defaults, /field_key: "callback_availability".*required: true/);
  assert.match(migration, /field_key in \('intimacy_comfort','callback_availability'\)/);
});

test("callback booking is bearer-token protected, capacity checked, and reuses submission calendar bookings", () => {
  assert.match(migration, /public_token uuid not null unique/);
  assert.match(migration, /occupied>=sl\.capacity/);
  assert.match(migration, /field_key='callback_booking'/);
  assert.match(migration, /session_type='callback'/);
});

test("callback emails remain manual campaigns and receive an individualized response link", () => {
  assert.match(communications, /messageType === "audition_callback"/);
  assert.match(communications, /callbackResponseUrl/);
  assert.match(communications, /campaign\.message_type === "audition_callback"/);
  assert.match(callbackPage, /No account or audition form is required/);
  assert.match(callbackPage, /Decline callback invitation/);
});

test("callback blocks preserve the selected booking mode", () => {
  assert.doesNotMatch(auditionActions, /sessionType===["']callback["']\\?["']staff_assigned["']/);
  assert.match(auditionActions, /const bookingMode=requestedBookingMode/);
});
