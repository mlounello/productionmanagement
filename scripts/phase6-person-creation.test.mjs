import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actions = await readFile(
  new URL("../app/projects/[projectId]/actions.ts", import.meta.url),
  "utf8"
);
const workspace = await readFile(
  new URL("../components/project-workspace-page.tsx", import.meta.url),
  "utf8"
);

test("person creation uses the atomic project-roster RPC before reporting success", () => {
  const action = actions.match(
    /export async function createPersonAction[\s\S]*?\n}\n\nexport async function createRoleAssignmentAction/
  )?.[0] ?? "";

  assert.match(action, /\.rpc\("create_project_person"/);
  assert.match(action, /if \(error \|\| !createdPerson\)/);
});

test("person creation returns to People with an unassigned roster message", () => {
  const action = actions.match(
    /export async function createPersonAction[\s\S]*?\n}\n\nexport async function createRoleAssignmentAction/
  )?.[0] ?? "";

  assert.match(action, /revalidatePath\("\/people"\)/);
  assert.match(action, /projectSuccessPath\([\s\S]*?"people"[\s\S]*?\)/);
  assert.match(action, /added to this project with an unassigned role/);
});

test("the Add Person form explains immediate project roster visibility", () => {
  assert.match(
    workspace,
    /A manually added person appears in this project directory immediately as Unassigned\./
  );
});

test("budget-access saves return to the same assignment card", () => {
  assert.match(actions, /projectAssignmentDetailSuccessPath/);
  assert.match(workspace, /id=\{`assignment-\$\{assignment\.id\}`\}/);
});
