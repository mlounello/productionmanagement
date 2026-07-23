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

test("person creation confirms the inserted row before reporting success", () => {
  const action = actions.match(
    /export async function createPersonAction[\s\S]*?\n}\n\nexport async function createRoleAssignmentAction/
  )?.[0] ?? "";

  assert.match(action, /\.insert\(\{[\s\S]*?\}\)[\s\S]*?\.select\("id"\)[\s\S]*?\.single\(\)/);
  assert.match(action, /if \(error \|\| !createdPerson\)/);
});

test("person creation returns to People with an assignment-aware success message", () => {
  const action = actions.match(
    /export async function createPersonAction[\s\S]*?\n}\n\nexport async function createRoleAssignmentAction/
  )?.[0] ?? "";

  assert.match(action, /revalidatePath\("\/people"\)/);
  assert.match(action, /projectSuccessPath\([\s\S]*?"people"[\s\S]*?\)/);
  assert.match(action, /ready to assign to a project role/);
});

test("the Add Person form explains when profiles enter the project directory", () => {
  assert.match(
    workspace,
    /A new profile becomes visible in this project directory after it is assigned to its first project role\./
  );
});
