import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const playbillSource = readFileSync(new URL("../lib/playbill.ts", import.meta.url), "utf8");
const theatreBudgetSource = readFileSync(new URL("../lib/theatre-budget.ts", import.meta.url), "utf8");
const projectActions = readFileSync(new URL("../app/projects/[projectId]/actions.ts", import.meta.url), "utf8");

test("Playbill cross-app access is server-only and uses the app-held credential", () => {
  assert.match(playbillSource, /import "server-only"/);
  assert.match(playbillSource, /createSupabaseAdminClient/);
  assert.doesNotMatch(playbillSource, /createSupabaseServerClient/);
  assert.match(playbillSource, /production_management_shows/);
  assert.match(playbillSource, /production_management_show_roles/);
  assert.match(playbillSource, /findPlaybillShowRoleSlot/);
});

test("Theatre Budget cross-app access is server-only and uses the app-held credential", () => {
  assert.match(theatreBudgetSource, /import "server-only"/);
  assert.match(theatreBudgetSource, /createSupabaseAdminClient/);
  assert.doesNotMatch(theatreBudgetSource, /createSupabaseServerClient/);
});

test("Playbill writes retain an explicit disabled-by-default feature gate", () => {
  assert.match(projectActions, /ENABLE_PLAYBILL_WRITES/);
  assert.match(projectActions, /if \(!ENABLE_PLAYBILL_WRITES\)/);
});

test("project actions authenticate before linking or manually syncing Playbill", () => {
  for (const actionName of [
    "linkPlaybillShowAction",
    "unlinkPlaybillShowAction",
    "syncProjectRoleToPlaybillAction",
    "syncAllProjectIntegrationsAction",
    "syncRoleAssignmentToPlaybillAction",
    "linkTheatreBudgetProjectAction",
    "unlinkTheatreBudgetProjectAction"
  ]) {
    const start = projectActions.indexOf(`export async function ${actionName}`);
    assert.notEqual(start, -1, `${actionName} is missing`);
    const nextAction = projectActions.indexOf("export async function ", start + 1);
    const body = projectActions.slice(start, nextAction === -1 ? undefined : nextAction);
    assert.match(body, /await requireUser\(\)/, `${actionName} must require a signed-in user`);
  }
});
