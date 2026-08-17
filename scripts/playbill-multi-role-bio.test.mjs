import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const playbillSource = readFileSync(new URL("../lib/playbill.ts", import.meta.url), "utf8");
const syncSource = readFileSync(new URL("../lib/playbill-sync.ts", import.meta.url), "utf8");

test("Playbill bio requests are resolved across every role held by one person", () => {
  assert.match(playbillSource, /ensurePersonBioSubmissionRequest/);
  assert.match(playbillSource, /\.eq\("show_id", input\.showId\)/);
  assert.match(playbillSource, /\.eq\("person_id", input\.personId\)/);
  assert.match(playbillSource, /\.in\("show_role_id", roleIds\)/);
});

test("duplicate bio requests keep their submissions before being removed", () => {
  const mergeStart = playbillSource.indexOf("async function mergeBioRequestInto");
  const mergeEnd = playbillSource.indexOf("export async function ensurePersonBioSubmissionRequest", mergeStart);
  const mergeBody = playbillSource.slice(mergeStart, mergeEnd);

  assert.match(mergeBody, /from\("submissions"\)/);
  assert.match(mergeBody, /update\(\{ request_id: canonical\.id \}\)/);
  assert.ok(
    mergeBody.indexOf('from("submissions")') < mergeBody.indexOf('from("submission_requests")'),
    "submitted material must move before the duplicate request is deleted"
  );
});

test("all assignments for a person share the canonical bio request", () => {
  assert.match(syncSource, /linkPersonAssignmentsToBioRequest/);
  assert.match(syncSource, /ensurePersonBioSubmissionRequest/);
  assert.match(syncSource, /markBioSubmissionRequestSourceById/);
  assert.match(syncSource, /replaceExternalLink/);
});

test("vacating one role transfers the person's bio request to a remaining role", () => {
  assert.match(syncSource, /movePersonBioRequestToRole/);
  assert.match(syncSource, /replacementRole/);
  assert.match(syncSource, /linkPersonAssignmentsToBioRequest/);
});
