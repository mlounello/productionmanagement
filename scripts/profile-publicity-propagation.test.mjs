import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/202607240300_track_inherited_publicity_bios.sql", import.meta.url),
  "utf8"
);
const action = readFileSync(new URL("../app/my-profile/actions.ts", import.meta.url), "utf8");
const feedbackGuard = readFileSync(
  new URL("../supabase/migrations/202607240400_prevent_playbill_publicity_feedback.sql", import.meta.url),
  "utf8"
);

test("profile edits update only empty or still-inherited show bios", () => {
  assert.match(migration, /bio\s*=\s*previous_bio/i);
  assert.match(migration, /trim\(coalesce\(bio,\s*''\)\)\s*=\s*''/i);
  assert.match(migration, /playbill_submission_status\s*<>\s*'locked'/i);
  assert.match(migration, /source_profile_version\s*=\s*new_profile_version/i);
});

test("approved inherited copies are automatically resubmitted to Playbill", () => {
  assert.match(migration, /then 'person_approved'/i);
  assert.match(migration, /then 'pending'/i);
  assert.match(action, /syncApprovedPublicityToPlaybill/);
  assert.match(action, /inherited show bio/i);
});

test("Playbill identity-only updates cannot overwrite newer Production Management publicity", () => {
  assert.match(feedbackGuard, /new\.bio is not distinct from old\.bio/i);
  assert.match(feedbackGuard, /new\.headshot_url is not distinct from old\.headshot_url/i);
  assert.match(feedbackGuard, /new\.submission_status is not distinct from old\.submission_status/i);
  assert.match(feedbackGuard, /return new;/i);
  assert.match(feedbackGuard, /enqueue_production_management_publicity_change/i);
});
