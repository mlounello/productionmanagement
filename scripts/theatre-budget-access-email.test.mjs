import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inviteSource = readFileSync(new URL("../lib/theatre-budget-access-invite.ts", import.meta.url), "utf8");
const actionSource = readFileSync(new URL("../app/projects/[projectId]/actions.ts", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../components/project-workspace-page.tsx", import.meta.url), "utf8");

test("Production Management requests a personalized access-ready email", () => {
  assert.match(inviteSource, /JSON\.stringify\(\{ email, fullName \}\)/);
  assert.match(inviteSource, /requestTheatreBudgetAccessEmail\(email, input\.fullName\)/);
  assert.match(actionSource, /permanent Theatre Budget app link was sent/);
  assert.match(workspaceSource, /Theatre Budget access email/);
  assert.doesNotMatch(actionSource, /sign-in link was sent/);
});
