import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import { requiresVerifiedGoogleMembership, shouldHoldAutomaticWelcome } from "../lib/google-group-welcome-policy.ts";

test("holds an automatic welcome while configured Google membership is missing", () => {
  const settings = {
    google_group_sync_enabled: true,
    active_google_group_email: "rent-cast-group@siena.edu",
  };
  assert.equal(requiresVerifiedGoogleMembership(settings), true);
  assert.equal(shouldHoldAutomaticWelcome(settings, "missing"), true);
  assert.equal(shouldHoldAutomaticWelcome(settings, "failed"), true);
  assert.equal(shouldHoldAutomaticWelcome(settings, "verified"), false);
});

test("does not gate welcomes for groups without an active membership check", () => {
  assert.equal(shouldHoldAutomaticWelcome({ google_group_sync_enabled: false, active_google_group_email: "cast@siena.edu" }, "missing"), false);
  assert.equal(shouldHoldAutomaticWelcome({ google_group_sync_enabled: true, active_google_group_email: "" }, "missing"), false);
});
