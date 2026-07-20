import assert from "node:assert/strict";
import test from "node:test";
import { MAX_AUDITION_UPLOAD_BYTES, auditionUploadSizeLabel, auditionUploadTooLarge } from "../lib/audition-upload.ts";

test("audition uploads allow files through the configured limit", () => {
  assert.equal(auditionUploadTooLarge({ size: MAX_AUDITION_UPLOAD_BYTES }), false);
  assert.equal(auditionUploadSizeLabel(), "3 MB");
});

test("audition uploads reject files over the configured limit", () => {
  assert.equal(auditionUploadTooLarge({ size: MAX_AUDITION_UPLOAD_BYTES + 1 }), true);
});
