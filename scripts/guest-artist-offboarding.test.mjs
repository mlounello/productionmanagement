import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/202610060100_guest_artist_offboarding.sql", import.meta.url);
const workspacePath = new URL("../components/project-workspace-page.tsx", import.meta.url);
const actionsPath = new URL("../app/projects/[projectId]/actions.ts", import.meta.url);

test("offboarding preserves paid history and releases only planned installments", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /status = 'check_paid'/);
  assert.match(sql, /status = 'planned'/);
  assert.match(sql, /set status = 'cancelled'/);
  assert.match(sql, /original_contract_value/);
  assert.doesNotMatch(sql, /delete from app_theatre_budget\.contract_installments/i);
  assert.doesNotMatch(sql, /set contract_value\s*=/i);
  assert.match(sql, /protect_terminated_guest_artist_contract/);
  assert.match(sql, /protect_terminated_guest_artist_installments/);
});

test("offboarding blocks submitted payment requests and is service-role only", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /status = 'check_request_submitted'/);
  assert.match(sql, /Cancel or resolve that request in Theatre Budget/);
  assert.match(sql, /lower\(membership\.role\) = 'owner'/);
  assert.match(sql, /grant execute[\s\S]*to service_role/i);
  assert.match(sql, /revoke all[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /has already been ended/);
});

test("owner UI requires a dated, private, explicit confirmation", async () => {
  const [workspace, actions] = await Promise.all([
    readFile(workspacePath, "utf8"),
    readFile(actionsPath, "utf8")
  ]);
  assert.match(workspace, /appRole === "owner"/);
  assert.match(workspace, /name="effectiveOn" type="date"/);
  assert.match(workspace, /name="privateNotes"/);
  assert.match(workspace, /name="confirmOffboarding" type="checkbox" required/);
  assert.match(actions, /role !== "owner"/);
  assert.match(actions, /vacateAssignmentInPlaybill/);
  assert.match(actions, /removeAssignmentGoogleAutomation/);
});
