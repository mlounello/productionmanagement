import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/202607240100_owner_only_person_deletion.sql", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/people/actions.ts", import.meta.url), "utf8");
const profile = readFileSync(new URL("../app/people/[personId]/page.tsx", import.meta.url), "utf8");

test("database limits permanent person deletion to the single owner", () => {
  assert.match(migration, /single_active_owner/);
  assert.match(migration, /get_user_role\(\) <> 'owner'/);
  assert.match(migration, /revoke delete on app_production_management\.people from authenticated/);
  assert.match(migration, /delete_person_as_owner/);
});

test("database blocks deletion while assignments remain and protects the owner profile", () => {
  assert.match(migration, /target_user_id = auth\.uid\(\)/);
  assert.match(migration, /Remove all role assignments before permanently deleting this person/);
  assert.match(migration, /confirmation_full_name/);
});

test("owner workflow vacates integrations before removing assignments", () => {
  assert.match(actions, /vacateAssignmentInPlaybill/);
  assert.match(actions, /removeAssignmentGoogleAutomation/);
  assert.match(actions, /local_entity_type", "role_assignment"/);
});

test("confirmation screen warns, lists assignments, and requires typed confirmation", () => {
  assert.match(profile, /Deletion is blocked/);
  assert.match(profile, /Remove assignment/);
  assert.match(profile, /Type <strong>\{typedPerson\.full_name\}<\/strong> to confirm/);
  assert.match(profile, /This cannot be undone/);
});
