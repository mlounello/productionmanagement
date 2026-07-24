import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import { formatPublicityReminderEmail } from "../lib/publicity-reminder-email.ts";

test("renders a branded reminder with approve and skip instructions", () => {
  const html = formatPublicityReminderEmail({
    bodyHtml: '<p>Hello Mike,</p><p><a href="https://example.com/private">Review My Publicity Profile</a></p>',
    templateSource: '<p>Hello {{person_name}},</p><p><a href="{{profile_access_url}}">Review My Publicity Profile</a></p>',
    projectTitle: "Rent",
    profileAccessUrl: "https://example.com/private",
    outstandingItems: ["show-specific bio", "your approval"]
  });
  assert.match(html, /Siena Theatre · Production Management/);
  assert.match(html, /Approve &amp; Submit to Playbill/);
  assert.match(html, /No bio needed for this production/);
  assert.match(html, /Review, Approve, or Skip My Bio/);
  assert.equal(html.match(/https:\/\/example\.com\/private/g)?.length, 1);
});

test("escapes project names and outstanding item labels", () => {
  const html = formatPublicityReminderEmail({
    bodyHtml: "<p>Hello.</p>",
    templateSource: "<p>Hello.</p>",
    projectTitle: "Rent <Final>",
    profileAccessUrl: "https://example.com/private",
    outstandingItems: ["bio <draft>"]
  });
  assert.match(html, /Rent &lt;Final&gt;/);
  assert.match(html, /bio &lt;draft&gt;/);
});
