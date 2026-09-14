import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../app/api/projects/[projectId]/auditions/export/route.ts", import.meta.url),
  "utf8"
);

test("packet export reads the current multi-booking relationship", () => {
  assert.match(
    source,
    /audition_submission_slots\(field_key, audition_slots\(starts_at, ends_at, audition_sessions\(title, booking_category\)\)\)/
  );
  assert.doesNotMatch(source, /primary_audition_slot/);
});

test("roster uses actual bookings, Eastern time, and the acting slot for audition-order sorting", () => {
  assert.match(source, /function rosterBookings/);
  assert.match(source, /function rosterSortTime/);
  assert.match(source, /category\.includes\("acting"\)/);
  assert.match(source, /timeZone: EASTERN_TIME_ZONE/);
  assert.match(source, /bookings\.map\(rosterBookingLabel\)/);
});
