import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import { sanitizeRichText, stripRichTextToPlain } from "../lib/rich-text.ts";

test("preserves safe headings and template-variable links",()=>{
  const html=sanitizeRichText('<h1>Welcome</h1><p><a href="{{profile_access_url}}">Open profile</a></p>');
  assert.equal(html,'<h1>Welcome</h1><p><a href="{{profile_access_url}}" target="_blank" rel="noopener noreferrer">Open profile</a></p>');
});

test("removes executable markup and unsafe links",()=>{
  const html=sanitizeRichText('<script>alert(1)</script><p onclick="alert(2)"><a href="javascript:alert(3)">Bad</a>Safe</p>');
  assert.equal(html,'<p>BadSafe</p>');
});

test("formatted bios count visible text rather than stored link markup",()=>{
  const visibleBio=`${"A".repeat(335)} website`;
  const html=sanitizeRichText(`<p>${"A".repeat(335)} <a href="https://example.com">website</a></p>`);
  assert.ok(html.length > visibleBio.length);
  assert.equal(stripRichTextToPlain(html),visibleBio);
  assert.equal(stripRichTextToPlain(html).length,343);
});
