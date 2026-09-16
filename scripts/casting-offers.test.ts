import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node's TypeScript loader requires explicit extensions.
import { offerProgress, type CastingOffer } from "../lib/casting-offers.ts";

function offer(status: CastingOffer["status"], released = false): CastingOffer {
  return { id: crypto.randomUUID(), status, released_at: released ? new Date().toISOString() : null } as CastingOffer;
}
test("progress excludes superseded revisions but retains declines in denominator", () => {
  const result = offerProgress([offer("superseded"), offer("accepted"), offer("declined"), offer("discussion"), offer("prepared")]);
  assert.equal(result.total, 4);
  assert.equal(result.accepted, 1);
  assert.equal(result.percent, 25);
  assert.equal(result.discussion, 1);
  assert.equal(result.declined, 1);
});
test("partial release is supported and already released offers cannot release again", () => {
  const result = offerProgress([offer("accepted", true), offer("accepted"), offer("prepared")]);
  assert.equal(result.accepted, 2);
  assert.equal(result.releasable.length, 1);
});
test("empty progress is zero, never NaN", () => {
  assert.equal(offerProgress([]).percent, 0);
});
