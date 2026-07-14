import test from "node:test";
import assert from "node:assert/strict";
// Node's built-in TypeScript loader requires the extension; the app compiler
// resolves this module normally through its bundler.
// @ts-expect-error TypeScript disallows .ts imports unless allowImportingTsExtensions is enabled.
import { publicitySyncBlockReason, publicityWritesDisabledReason } from "../lib/publicity-sync-policy.ts";

test("blocks publicity sync when Playbill writes are disabled", () => {
  assert.equal(
    publicityWritesDisabledReason(false),
    "Playbill writes are disabled. The approved production copy was preserved and was not sent."
  );
  assert.equal(publicityWritesDisabledReason(true), null);
});

test("allows an unpublished draft Playbill show", () => {
  assert.equal(publicitySyncBlockReason({ show_id: "show-1", status: "draft", is_published: false }), null);
});

test("blocks a published Playbill show", () => {
  assert.equal(
    publicitySyncBlockReason({ show_id: "show-1", status: "draft", is_published: true }),
    "The linked Playbill show is published and read-only."
  );
});

test("blocks an unpublished show that is no longer a draft", () => {
  assert.equal(
    publicitySyncBlockReason({ show_id: "show-1", status: "archived", is_published: false }),
    "The linked Playbill show is not a draft and cannot be changed."
  );
});

test("blocks a missing Playbill link", () => {
  assert.equal(publicitySyncBlockReason(null), "This project is not linked to a Playbill show.");
});
