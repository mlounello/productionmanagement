import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/202609150100_multi_person_roles.sql", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/projects/[projectId]/actions.ts", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../components/project-workspace-page.tsx", import.meta.url), "utf8");
const bulkAssignments = readFileSync(new URL("../components/bulk-assignment-forms.tsx", import.meta.url), "utf8");
const playbillSync = readFileSync(new URL("../lib/playbill-sync.ts", import.meta.url), "utf8");

test("roles default to one person and can opt into a finite or unlimited capacity", () => {
  assert.match(migration, /allows_multiple_assignments boolean not null default false/i);
  assert.match(migration, /assignment_capacity integer/i);
  assert.match(migration, /role_has_assignment_capacity/i);
  assert.match(migration, /role_assignments_capacity_guard/i);
  assert.match(migration, /for update/i);
});

test("role edits cannot reduce capacity below active assignments", () => {
  assert.match(migration, /project_roles_capacity_change_guard/i);
  assert.match(migration, /active_count > target_capacity/i);
});

test("assignment actions enforce configured capacity instead of treating every role as single-person", () => {
  assert.match(actions, /allows_multiple_assignments, assignment_capacity/);
  assert.match(actions, /That role has reached its assignment capacity/);
  assert.doesNotMatch(actions, /That role is already filled\. Choose another role\./);
});

test("role assignment UI keeps multi-person roles available and permits repeated bulk rows", () => {
  assert.match(workspace, /role\.allows_multiple_assignments/);
  assert.match(workspace, /role\.assignment_capacity === null \|\| assigned < role\.assignment_capacity/);
  assert.match(bulkAssignments, /if \(!option\.allowsMultiple\) return false/);
  assert.match(bulkAssignments, /selectedElsewhere < option\.remainingCapacity/);
});

test("audition role choices respect remaining multi-person capacity", () => {
  assert.match(migration, /get_public_audition_form[\s\S]+role_has_assignment_capacity\(r\.id\)/i);
  assert.match(migration, /get_audition_form_preview[\s\S]+role_has_assignment_capacity\(r\.id\)/i);
});

test("Playbill sync maintains a separate linked credit for every assignment", () => {
  assert.match(playbillSync, /if \(showRole && \(!showRole\.person_id \|\| showRole\.person_id === playbillPerson\.id\)\)/);
  assert.match(playbillSync, /createPlaybillShowRole\(roleInput\)/);
  assert.match(playbillSync, /if \(role\.allows_multiple_assignments\)[\s\S]+syncAssignmentToPlaybillWithClient/);
});
