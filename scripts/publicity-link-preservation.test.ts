import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import { normalizeRichTextLinkUrl, sanitizeRichText } from "../lib/rich-text.ts";

test("keeps safe bio links clickable and opens them safely", () => {
  assert.equal(
    sanitizeRichText('<p>Portfolio: <a href="https://example.com/work?type=bio&amp;year=2026">Example</a></p>'),
    '<p>Portfolio: <a href="https://example.com/work?type=bio&amp;year=2026" target="_blank" rel="noopener noreferrer">Example</a></p>'
  );
});

test("normalizes common web and email links before saving a bio", () => {
  assert.equal(normalizeRichTextLinkUrl("www.example.com/portfolio"), "https://www.example.com/portfolio");
  assert.equal(normalizeRichTextLinkUrl("artist@example.com"), "mailto:artist@example.com");
  assert.equal(
    sanitizeRichText('<a href="example.com">Portfolio</a>'),
    '<a href="https://example.com" target="_blank" rel="noopener noreferrer">Portfolio</a>'
  );
});

test("removes unsafe link destinations", () => {
  assert.equal(normalizeRichTextLinkUrl("javascript:alert(1)"), null);
  assert.equal(sanitizeRichText('<a href="javascript:alert(1)">Bad link</a>'), "Bad link");
  assert.equal(sanitizeRichText("<p><a>Dead link</a></p>"), "<p>Dead link</p>");
});

test("the Playbill bridge transfers the formatted bio instead of flattening it", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/202607132359_phase1_playbill_publicity_safety.sql", import.meta.url),
    "utf8"
  );
  assert.match(migration, /bio\s*=\s*submission\.bio/i);
});

test("the bio toolbar preserves the editor selection before creating a link", () => {
  const field = readFileSync(new URL("../components/publicity-bio-field.tsx", import.meta.url), "utf8");
  assert.match(field, /selectionRef/);
  assert.match(field, /event\.preventDefault\(\)/);
  assert.match(field, /restoreSelection\(\)/);
  assert.match(field, /Select the words you want to turn into a link first/);
});
