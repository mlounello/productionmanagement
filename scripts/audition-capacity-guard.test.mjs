import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/202609140100_audition_capacity_guard.sql", import.meta.url), "utf8");
const form = readFileSync(new URL("../components/remembered-audition-block-form.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/projects/[projectId]/auditions/actions.ts", import.meta.url), "utf8");

test("all booking writes are protected by a row-locking capacity trigger", () => {
  assert.match(migration, /select capacity into allowed_capacity[\s\S]*for update/);
  assert.match(migration, /before insert or update of slot_id/);
  assert.match(migration, /occupied>=allowed_capacity/);
});

test("remembered block capacity is isolated by format and multi-person appointments require confirmation", () => {
  assert.match(form, /__capacityByFormat/);
  assert.match(form, /sessionType\.value === "appointments"/);
  assert.match(form, /allowMultipleAppointmentBookings/);
  assert.match(actions, /sessionType==="appointments"&&capacity>1/);
});

test("staff can move a booking atomically before calendar resync", () => {
  assert.match(migration, /staff_move_audition_booking/);
  assert.match(migration, /can_manage_auditions\(target_project_id\)/);
  assert.match(actions, /staffMoveAuditionBookingAction/);
  assert.match(actions, /syncAuditionCalendarSlots\(projectId,\[\.\.\.oldSlotIds,\.\.\.newSlotIds\]\)/);
});
