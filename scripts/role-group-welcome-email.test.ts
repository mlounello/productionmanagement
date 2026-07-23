import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import { formatRoleGroupWelcomeEmail, insertBeforeEmailSignoff } from "../lib/role-group-welcome-email.ts";

test("places an automatically supplied profile block before the signature", () => {
  const body = "<p>Hello Mike,</p><p>Welcome aboard.</p><p>Best,<br>Mike</p>";
  const result = formatRoleGroupWelcomeEmail({
    bodyHtml: body,
    templateSource: "<p>Hello {{person_name}},</p><p>Welcome aboard.</p><p>Best,<br>Mike</p>",
    projectTitle: "Rent",
    roleGroup: "cast",
    profileAccessUrl: "https://example.com/profile",
  });
  assert.ok(result.indexOf("Complete Your Production Profile") < result.indexOf("Best,"));
  assert.match(result, /Siena Theatre/);
  assert.match(result, /background:#164c3c/);
});

test("does not duplicate a profile section supplied by the template", () => {
  const result = formatRoleGroupWelcomeEmail({
    bodyHtml: '<p><a href="https://example.com/profile">Open My Production Profile</a></p><p>Best,<br>Mike</p>',
    templateSource: '<p><a href="{{profile_access_url}}">Open My Production Profile</a></p><p>Best,<br>Mike</p>',
    projectTitle: "Rent",
    roleGroup: "production_team",
    profileAccessUrl: "https://example.com/profile",
  });
  assert.equal(result.match(/Open My Production Profile/g)?.length, 1);
});

test("falls back to appending when no recognizable signoff is present", () => {
  assert.equal(insertBeforeEmailSignoff("<p>Hello</p>", "<p>Profile</p>"), "<p>Hello</p><p>Profile</p>");
});
