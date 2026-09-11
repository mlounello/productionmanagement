import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's test runner uses the built-in TypeScript loader.
import { auditionPdfText } from "../lib/audition-pdf-text.ts";

test("converts symbols that built-in PDF fonts cannot encode", () => {
  assert.equal(auditionPdfText("Strong singer ☆ C4–A5 ♯"), "Strong singer * C4-A5 #");
});

test("keeps packet headings readable when they use middle-dot separators", () => {
  assert.equal(
    auditionPdfText("Director Audition Packet · Liam Healy · 2/7"),
    "Director Audition Packet | Liam Healy | 2/7",
  );
});

test("keeps line breaks while producing printable ASCII", () => {
  assert.equal(auditionPdfText("Renée\nSecond • line"), "Renee\nSecond * line");
});
