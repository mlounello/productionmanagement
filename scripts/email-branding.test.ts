import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's test runner uses the built-in TypeScript loader.
import { brandProductionManagementEmail, PRODUCTION_MANAGEMENT_FROM } from "../lib/email-branding.ts";

test("uses the single Production Management sender identity", () => {
  assert.equal(
    PRODUCTION_MANAGEMENT_FROM,
    "Production Management <production-management@mlounello.com>"
  );
});

test("wraps ordinary template content in the Siena email layout", () => {
  const html = brandProductionManagementEmail("<p>Hello Mike</p>");
  assert.match(html, /data-pm-email-brand="siena"/);
  assert.match(html, /Siena Theatre/);
  assert.match(html, /Production Management/);
  assert.match(html, /#164c3c/);
  assert.match(html, /#f2c75c/);
  assert.match(html, /<p>Hello Mike<\/p>/);
});

test("does not double-wrap a specialized branded email", () => {
  const branded = '<div data-pm-email-brand="siena"><p>Existing layout</p></div>';
  assert.equal(brandProductionManagementEmail(branded), branded);
});
