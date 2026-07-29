import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../lib/theatre-budget.ts", import.meta.url), "utf8");

test("contract summaries identify both Theatre Budget project relationships explicitly", () => {
  assert.match(source, /accounting_project:projects!contracts_project_id_fkey/);
  assert.match(source, /production_project:projects!contracts_production_project_id_fkey/);
  assert.doesNotMatch(source, /updated_at, projects\(name, season\)/);
});
