import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/202607230300_automatic_assignment_publicity.sql", import.meta.url), "utf8");

test("assignment trigger prepares publicity before the assignment is visible", () => {
  assert.match(migration, /before insert or update of status, project_id, person_id/i);
  assert.match(migration, /prepare_assignment_publicity/i);
  assert.match(migration, /on conflict \(project_id, person_id\) do nothing/i);
});

test("automatic preparation preserves inactive assignments and existing production copies", () => {
  assert.match(migration, /new\.status in \('declined', 'withdrawn'\)/i);
  assert.doesNotMatch(migration, /on conflict[\s\S]+do update/i);
});

test("migration backfills active assignments and marks their onboarding checklist", () => {
  assert.match(migration, /where assignment\.status not in \('declined', 'withdrawn'\)/i);
  assert.match(migration, /jsonb_build_object\('publicity_prepared', true\)/i);
});
