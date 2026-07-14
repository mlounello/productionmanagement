import assert from "node:assert/strict";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import { displayStatus, statusDescription, statusTone } from "../lib/status-display.ts";

assert.equal(displayStatus("person_approved"), "Person approved");
assert.equal(displayStatus("not_attempted"), "Not attempted");
assert.equal(statusTone("synced"), "success");
assert.equal(statusTone("missing"), "danger");
assert.equal(statusTone("submitted"), "info");
assert.match(statusDescription("missing", "google-membership"), /not found/i);
assert.match(statusDescription("locked", "playbill"), /read-only/i);
