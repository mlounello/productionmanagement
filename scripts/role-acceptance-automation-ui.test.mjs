import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/projects/[projectId]/onboarding/page.tsx", import.meta.url), "utf8");
const actions = readFileSync(new URL("../app/projects/[projectId]/onboarding/actions.ts", import.meta.url), "utf8");
const readiness = readFileSync(new URL("../lib/project-readiness.ts", import.meta.url), "utf8");

test("onboarding exposes a dedicated role-acceptance automation control", () => {
  assert.match(page, /id="acceptance-automation"/);
  assert.match(page, /Turn automatic sending on/);
  assert.match(page, /Existing outstanding students are not sent retroactively/);
  assert.match(actions, /setRoleAcceptanceAutomationAction/);
  assert.match(actions, /auto_send:enabled/);
});

test("project readiness links directly to the automation control", () => {
  assert.match(readiness, /onboarding#acceptance-automation/);
});
