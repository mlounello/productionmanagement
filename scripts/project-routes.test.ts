import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import { isProjectWorkspace, projectWorkspacePath } from "../lib/project-routes.ts";

test("recognizes only supported project workspaces", () => {
  assert.equal(isProjectWorkspace("roles"), true);
  assert.equal(isProjectWorkspace("run-of-show"), true);
  assert.equal(isProjectWorkspace("publicity"), false);
  assert.equal(isProjectWorkspace("unknown"), false);
});

test("builds real nested project routes", () => {
  assert.equal(projectWorkspacePath("project-1", "calendar"), "/projects/project-1/calendar");
  assert.equal(projectWorkspacePath("project-1", "overview"), "/projects/project-1/overview");
});

test("preserves action messages on the destination route", () => {
  assert.equal(projectWorkspacePath("project-1", "roles", { success: "Role saved." }), "/projects/project-1/roles?success=Role+saved.");
});
