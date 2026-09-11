import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/202609110100_prevent_duplicate_audition_submissions.sql", import.meta.url),
  "utf8",
);
const action = fs.readFileSync(new URL("../app/auditions/[token]/actions.ts", import.meta.url), "utf8");
const adminPage = fs.readFileSync(new URL("../app/projects/[projectId]/auditions/page.tsx", import.meta.url), "utf8");

test("serializes duplicate checks and rejects the same active form/email pair", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /existing\.form_id\s*=\s*new\.form_id/);
  assert.match(migration, /lower\(trim\(existing\.applicant_email\)\)\s*=\s*new\.applicant_email/);
  assert.match(migration, /existing\.cancelled_at is null/);
  assert.match(migration, /before insert on app_production_management\.audition_submissions/);
});

test("returns a clear public message instead of exposing a database error", () => {
  assert.match(action, /error\?\.code === "23505"/);
  assert.match(action, /An audition form has already been submitted with this email address/);
});

test("keeps cancelled attempts out of active applicant counts and packet choices", () => {
  assert.match(adminPage, /const activeSubmissionRows = submissionRows\.filter/);
  assert.match(adminPage, /const cancelledSubmissionRows = submissionRows\.filter/);
  assert.match(adminPage, /activeSubmissionRows\.length/);
  assert.match(adminPage, /activeSubmissionRows\.map\(\(submission\).*key={`export-/s);
  assert.match(adminPage, /Cancelled submission history/);
});
