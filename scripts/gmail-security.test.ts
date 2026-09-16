import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's TypeScript loader requires explicit extensions.
import { assertSienaGmailIdentity, buildGmailTestMessage, openGmailSecret, sealGmailSecret, validateGmailState } from "../lib/gmail-security.ts";

const key = "a-test-key-only-not-for-production-123456789";
test("refresh tokens are encrypted and authenticated for their purpose", () => {
  const sealed = sealGmailSecret("private-refresh-token", key, "refresh-token");
  assert.equal(sealed.includes("private-refresh-token"), false);
  assert.equal(openGmailSecret(sealed, key, "refresh-token"), "private-refresh-token");
  assert.throws(() => openGmailSecret(sealed, key, "oauth-state"));
  assert.throws(() => openGmailSecret(sealed, key + "wrong", "refresh-token"));
  assert.throws(() => openGmailSecret(sealed.slice(0, -5), key, "refresh-token"));
  assert.throws(() => sealGmailSecret("token", "short", "refresh-token"));
});
test("OAuth state is bound to the owner, expiration and exact nonce", () => {
  const state = { state: "a".repeat(43), verifier: "test-verifier", userId: "owner", expiresAt: 2000 };
  assert.equal(validateGmailState(state, state.state, "owner", 1000), true);
  assert.equal(validateGmailState(state, "b".repeat(43), "owner", 1000), false);
  assert.equal(validateGmailState(state, state.state, "other", 1000), false);
  assert.equal(validateGmailState(state, state.state, "owner", 2000), false);
  assert.equal(validateGmailState({ ...state, expiresAt: NaN }, state.state, "owner", 1000), false);
});
test("only the verified approved Siena account may connect", () => {
  assert.doesNotThrow(() => assertSienaGmailIdentity({ email: "mlounello@siena.edu", email_verified: true }));
  assert.throws(() => assertSienaGmailIdentity({ email: "someone@gmail.com", email_verified: true }));
  assert.throws(() => assertSienaGmailIdentity({ email: "mlounello@siena.edu", email_verified: false }));
});
test("test email has a fixed Siena sender and recipient, HTML and plain text", () => {
  const raw = buildGmailTestMessage("<p>Siena test — welcome!</p>");
  assert.match(raw, /^[A-Za-z0-9_-]+$/);
  const mime = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(mime, /From: Siena Theatre Production Management <mlounello@siena.edu>/);
  assert.match(mime, /To: mlounello@siena.edu/);
  assert.match(mime, /multipart\/alternative/);
  assert.match(mime, /text\/plain; charset=UTF-8/);
  assert.match(mime, /text\/html; charset=UTF-8/);
  assert.ok(mime.includes(Buffer.from("<p>Siena test — welcome!</p>").toString("base64")));
});
