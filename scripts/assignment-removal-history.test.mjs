import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/202609270100_preserve_casting_history_on_assignment_removal.sql", import.meta.url), "utf8");
const ownerRemoval = readFileSync(new URL("../app/people/actions.ts", import.meta.url), "utf8");

test("assignment removal preserves signed casting and acceptance history", () => {
  assert.match(migration, /role_acceptance_requests[\s\S]+alter column role_assignment_id drop not null/i);
  assert.match(migration, /foreign key \(role_assignment_id\)[\s\S]+role_assignments\(id\)[\s\S]+on delete set null/i);
  assert.doesNotMatch(migration, /delete from\s+app_production_management\.casting_offers/i);
  assert.doesNotMatch(migration, /delete from\s+app_production_management\.role_acceptance_requests/i);
});

test("owner removal still deletes only the selected active assignment", () => {
  assert.match(ownerRemoval, /from\("role_assignments"\)[\s\S]+\.delete\(\)[\s\S]+\.eq\("id", parsed\.data\.assignmentId\)/);
});
