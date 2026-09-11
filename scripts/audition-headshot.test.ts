import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
// @ts-expect-error Node's test runner uses the built-in TypeScript loader.
import { normalizeAuditionHeadshot } from "../lib/audition-headshot.ts";

test("applies EXIF orientation and removes it from the normalized headshot", async () => {
  const sidewaysPixels = await sharp({
    create: { width: 40, height: 20, channels: 3, background: "#006747" },
  }).jpeg().withMetadata({ orientation: 6 }).toBuffer();

  const input = await sharp(sidewaysPixels).metadata();
  assert.equal(input.width, 40);
  assert.equal(input.height, 20);
  assert.equal(input.orientation, 6);

  const normalized = await normalizeAuditionHeadshot(sidewaysPixels);
  const output = await sharp(normalized).metadata();
  assert.equal(output.width, 20);
  assert.equal(output.height, 40);
  assert.ok(output.orientation === undefined || output.orientation === 1);
  assert.equal(output.format, "jpeg");
});
