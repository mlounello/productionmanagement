import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import { availableActorRoleNames } from "../lib/audition-director-notes.ts";

test("Director Notes lists only available cast roles", () => {
  const result = availableActorRoleNames([
    { name: "Mark Cohen", role_group: "cast", role_assignments: [] },
    { name: "Roger Davis", role_group: "cast", role_assignments: [{ status: "declined" }] },
    { name: "Mimi Marquez", role_group: "cast", role_assignments: [{ status: "accepted" }] },
    { name: "Lighting Designer", role_group: "creative_team", role_assignments: [] },
  ]);

  assert.deepEqual(result, ["Mark Cohen", "Roger Davis"]);
});

test("Ensemble is reserved for the dedicated Director Notes checkbox", () => {
  const result = availableActorRoleNames([
    { name: "Ensemble", role_group: "cast", role_assignments: [] },
    { name: "ENSEMBLE", role_group: "cast", role_assignments: [] },
    { name: "Angel", role_group: "cast", role_assignments: [] },
  ]);

  assert.deepEqual(result, ["Angel"]);
});

test("available actor roles are unique and alphabetical", () => {
  const result = availableActorRoleNames([
    { name: "Roger", role_group: "cast", role_assignments: [] },
    { name: "Mark", role_group: "cast", role_assignments: [] },
    { name: "Roger", role_group: "cast", role_assignments: [] },
  ]);

  assert.deepEqual(result, ["Mark", "Roger"]);
});
