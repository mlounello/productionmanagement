import assert from "node:assert/strict";
import test from "node:test";
import { AUTH_CALLBACK_PATH, PROFILE_AUTH_CALLBACK_PATH, safeAuthDestination, shouldNormalizeAuthCallback } from "../lib/auth-callback-routing.ts";

test("dedicated cross-device profile callbacks are not intercepted", () => {
  assert.equal(shouldNormalizeAuthCallback(PROFILE_AUTH_CALLBACK_PATH, true), false);
});

test("generic callbacks remain in place and stray callback parameters normalize", () => {
  assert.equal(shouldNormalizeAuthCallback(AUTH_CALLBACK_PATH, true), false);
  assert.equal(shouldNormalizeAuthCallback("/projects", true), true);
  assert.equal(shouldNormalizeAuthCallback("/projects", false), false);
});

test("profile destinations remain local and default to My Profile", () => {
  assert.equal(safeAuthDestination("/my-profile", "/projects"), "/my-profile");
  assert.equal(safeAuthDestination("https://example.com", "/my-profile"), "/my-profile");
  assert.equal(safeAuthDestination("//example.com", "/my-profile"), "/my-profile");
  assert.equal(safeAuthDestination(null, "/my-profile"), "/my-profile");
});
