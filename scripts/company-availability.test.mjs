import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const model = readFileSync(new URL("../lib/company-availability.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/projects/[projectId]/availability/page.tsx", import.meta.url), "utf8");
const viewer = readFileSync(new URL("../components/company-availability-viewer.tsx", import.meta.url), "utf8");
const profile = readFileSync(new URL("../app/my-profile/page.tsx", import.meta.url), "utf8");
const accessPage = readFileSync(new URL("../app/profile-access/[token]/page.tsx", import.meta.url), "utf8");

test("availability model expands recurring calls and applies dated exceptions", () => {
  assert.match(model, /conflictOccurrences\(input\.windows, input\.calendar\)/);
  assert.match(model, /one_off_conflicts[\s\S]+occurrence_date === date/);
  assert.match(model, /latest\.has\(response\.person_id\)/);
});

test("viewer is restricted to project staff and uses active company assignments", () => {
  assert.match(page, /allowed_roles: \["project_manager", "producer", "department_head", "staff"\]/);
  assert.match(page, /role_assignments[\s\S]+eq\("status", "accepted"\)/);
  assert.match(page, /person\.roleGroups\.includes\("cast"\)/);
  assert.match(page, /candidates = \[\.\.\.projectPeople\.values\(\)\]/);
  assert.match(page, /createSupabaseAdminClient/);
  assert.match(page, /project_availability_viewers/);
});

test("viewer provides calendar, call, person, detail, filter, and print modes", () => {
  for (const expected of ["Calendar", "By Call", "By Person", "Find a company member", "Print current view", "availability-drawer"]) assert.match(viewer, new RegExp(expected));
});

test("dedicated viewers retain a discoverable link after accepting access", () => {
  assert.match(profile, /project_availability_viewers/);
  assert.match(profile, /View Cast Availability/);
  assert.match(accessPage, /includeUsed: true/);
  assert.match(accessPage, /linkedPerson[\s\S]+destination_path/);
  assert.match(accessPage, /This invitation has already been opened/);
});
