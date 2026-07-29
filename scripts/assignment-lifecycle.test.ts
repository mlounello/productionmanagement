import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import { assignmentConfirmationExempt, assignmentUsesStudentAcceptance } from "../lib/assignment-lifecycle.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/202607290400_assignment_confirmation_exemptions.sql", import.meta.url),
  "utf8"
);

test("Guest Artists and Siena Employees never require a separate confirmation", () => {
  assert.equal(assignmentConfirmationExempt({ isGuestArtist: true, isSienaEmployee: false }), true);
  assert.equal(assignmentConfirmationExempt({ isGuestArtist: false, isSienaEmployee: true }), true);
  assert.equal(assignmentConfirmationExempt({ isGuestArtist: false, isSienaEmployee: false }), false);
});

test("student acceptance excludes Guest Artists and Siena Employees", () => {
  assert.equal(assignmentUsesStudentAcceptance({ personType: "student", isGuestArtist: false, isSienaEmployee: false }), true);
  assert.equal(assignmentUsesStudentAcceptance({ personType: "student", isGuestArtist: true, isSienaEmployee: false }), false);
  assert.equal(assignmentUsesStudentAcceptance({ personType: "student", isGuestArtist: false, isSienaEmployee: true }), false);
  assert.equal(assignmentUsesStudentAcceptance({ personType: "staff", isGuestArtist: false, isSienaEmployee: false }), false);
});

test("migration grants only the server integration activation permission", () => {
  assert.match(migration, /grant execute on function app_production_management\.activate_pending_department_budget_access\(uuid, text\)\s+to service_role/i);
  assert.doesNotMatch(migration, /grant execute[\s\S]+to (public|anon|authenticated)/i);
});

test("migration stores not-required confirmation and waives obsolete offers", () => {
  assert.match(migration, /confirmation_status in \([^)]*'not_required'/i);
  assert.match(migration, /new\.is_guest_artist or employee/i);
  assert.match(migration, /status = 'waived'/i);
});

test("signed Theatre Budget contracts accept linked Guest Artist assignments", () => {
  assert.match(migration, /contract_signed_returned/i);
  assert.match(migration, /siena_signed/i);
  assert.match(migration, /reconcile_assignments_after_contract_status/i);
  assert.match(migration, /status = 'accepted'/i);
});
