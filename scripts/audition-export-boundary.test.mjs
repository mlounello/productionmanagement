import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../app/api/projects/[projectId]/auditions/export/route.ts", import.meta.url),
  "utf8"
);

test("packet export disambiguates the primary audition-slot relationship", () => {
  assert.match(
    source,
    /primary_audition_slot:audition_slots!audition_submissions_slot_id_fkey\(starts_at\)/
  );
  assert.doesNotMatch(source, /[, ]audition_slots\(starts_at\)/);
});

test("packet sorting and roster rendering use the explicit primary slot alias", () => {
  assert.match(source, /a\.primary_audition_slot/);
  assert.match(source, /row\.primary_audition_slot/);
});
