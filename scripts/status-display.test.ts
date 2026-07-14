import assert from "node:assert/strict";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import { displayStatus, statusDescription, statusTone } from "../lib/status-display.ts";

assert.equal(displayStatus("person_approved"), "Person approved");
assert.equal(displayStatus("not_attempted"), "Not attempted");
assert.equal(statusTone("synced"), "success");
assert.equal(statusTone("missing"), "danger");
assert.equal(statusTone("submitted"), "info");
assert.equal(statusTone("linked"), "success");
assert.equal(statusTone("vacant"), "info");
assert.equal(statusTone("offered"), "warning");
assert.equal(statusTone("accepted"), "success");
assert.match(statusDescription("missing", "google-membership"), /not found/i);
assert.match(statusDescription("locked", "playbill"), /read-only/i);
