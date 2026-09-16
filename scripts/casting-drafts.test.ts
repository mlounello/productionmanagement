import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import { castingDraftSchema, draftWarnings, type CastingDraft } from "../lib/casting-drafts.ts";

const id = "10000000-0000-4000-8000-000000000001";
const second = "10000000-0000-4000-8000-000000000002";
const person = { id, full_name: "Actor", email: "actor@example.test", person_type: "student" };
const role = { id, name: "Ensemble", role_group: "cast", allows_multiple_assignments: true, assignment_capacity: 9 };
const draft: CastingDraft = { id, project_id: id, person_id: id, role_id: id, coverage_type: "none", covered_role_ids: [], additional_duties: "", actor_notes: "", revision: 1, status: "draft" };
const input = { projectId: id, personId: id, roleId: id, coverageType: "none", coveredRoleIds: [], additionalDuties: "", actorNotes: "" };

test("understudy and swing require coverage; ordinary actors do not", () => {
  assert.equal(castingDraftSchema.safeParse(input).success, true);
  for (const coverageType of ["understudy", "swing"]) {
    assert.equal(castingDraftSchema.safeParse({ ...input, coverageType }).success, false);
    assert.equal(castingDraftSchema.safeParse({ ...input, coverageType, coveredRoleIds: [second] }).success, true);
  }
});
test("editing requires a revision to prevent overwriting another editor", () => {
  assert.equal(castingDraftSchema.safeParse({ ...input, id }).success, false);
  assert.equal(castingDraftSchema.safeParse({ ...input, id, revision: 1 }).success, true);
});
test("nine Ensemble actors fit; a tenth is flagged", () => {
  const drafts = Array.from({ length: 9 }, (_, i) => ({ ...draft, id: String(i), person_id: String(i) }));
  assert.deepEqual(draftWarnings(drafts[0], [{ ...person, id: "0" }], [role], drafts, []), []);
  assert.match(draftWarnings(draft, [person], [role], drafts, [])[0], /10 people planned for 9 places/);
});
test("unlimited roles permit more actors; withdrawn proposals and declined assignments do not count", () => {
  const other = { ...draft, id: second, person_id: second, status: "withdrawn" as const };
  assert.deepEqual(draftWarnings(draft, [person], [{ ...role, assignment_capacity: 1 }], [draft, other], [{ person_id: second, role_id: id, status: "declined" }]), []);
  assert.deepEqual(draftWarnings(draft, [person], [{ ...role, assignment_capacity: null }], [draft, { ...other, status: "draft" }], []), []);
});
test("existing assignment is flagged without counting the same person twice", () => {
  const warnings = draftWarnings(draft, [person], [{ ...role, allows_multiple_assignments: false }], [draft], [{ role_id: id, person_id: id, status: "accepted" }]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Already assigned/);
});
test("missing email and a full single-person role both surface", () => {
  const warnings = draftWarnings(draft, [{ ...person, email: "" }], [{ ...role, allows_multiple_assignments: false }], [draft], [{ role_id: id, person_id: second, status: "accepted" }]);
  assert.equal(warnings.length, 2);
});
