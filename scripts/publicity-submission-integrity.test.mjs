import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const profileActions = readFileSync(new URL("../app/my-profile/actions.ts", import.meta.url), "utf8");
const publicitySync = readFileSync(new URL("../lib/publicity-sync.ts", import.meta.url), "utf8");
const directory = readFileSync(new URL("../components/publicity-directory.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202610010100_publicity_submission_integrity.sql", import.meta.url), "utf8");

test("a person cannot approve an empty or exempt production bio", () => {
  assert.match(profileActions, /submission\.bio_required === false/);
  assert.match(profileActions, /if \(!visibleBio\)/);
  assert.match(migration, /and submission\.bio_required/);
  assert.match(migration, /Save a visible show-specific bio/);
});

test("Playbill sync independently rejects an empty visible bio", () => {
  assert.match(publicitySync, /const visibleBio = stripRichTextToPlain/);
  assert.match(publicitySync, /A saved show-specific bio is required/);
});

test("the publicity drawer exposes saved copy on an exempt record", () => {
  assert.match(directory, /A saved bio exists even though this production is marked/);
  assert.match(directory, /<PublicityBioPreview bio=\{selected\.bio\}/);
});

test("migration repairs impossible unlocked approval states without deleting saved copy", () => {
  assert.match(migration, /Approval was reset because no visible production bio was saved/);
  assert.match(migration, /where bio_required = false/);
  assert.doesNotMatch(migration, /delete from app_production_management\.project_publicity_submissions/i);
});
