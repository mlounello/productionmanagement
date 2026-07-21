import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import { elevatedSupabaseConfiguration } from "../lib/supabase-admin-config.ts";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import { profileIntakeHmacSecret } from "../lib/profile-intake-secret.ts";

const url = "https://projectref.supabase.co";
const jwt = (payload: Record<string, unknown>) =>
  `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.test-signature`;

test("accepts a modern server-only Supabase secret key", () => {
  const result = elevatedSupabaseConfiguration({
    NEXT_PUBLIC_SUPABASE_URL: url,
    SUPABASE_SECRET_KEY: "sb_secret_abcdefghijklmnopqrstuvwxyz012345",
  });
  assert.equal(result.keyType, "secret");
});

test("prefers the modern key when a legacy variable also exists", () => {
  const result = elevatedSupabaseConfiguration({
    NEXT_PUBLIC_SUPABASE_URL: url,
    SUPABASE_SECRET_KEY: "sb_secret_abcdefghijklmnopqrstuvwxyz012345",
    SUPABASE_SERVICE_ROLE_KEY: "short-value",
  });
  assert.equal(result.keyType, "secret");
});

test("rejects a short invalid service-role value", () => {
  assert.throws(
    () => elevatedSupabaseConfiguration({ NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: "short-value" }),
    /not a secret or service-role key/
  );
});

test("accepts a matching legacy service-role JWT", () => {
  const result = elevatedSupabaseConfiguration({
    NEXT_PUBLIC_SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "service_role", ref: "projectref" }),
  });
  assert.equal(result.keyType, "legacy_service_role");
});

test("rejects an anon JWT and a legacy key from another project", () => {
  assert.throws(
    () => elevatedSupabaseConfiguration({ NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "anon", ref: "projectref" }) }),
    /not a secret or service-role key/
  );
  assert.throws(
    () => elevatedSupabaseConfiguration({ NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "service_role", ref: "otherref" }) }),
    /different project/
  );
});

test("requires an independent strong intake HMAC secret in production", () => {
  assert.throws(() => profileIntakeHmacSecret({ NODE_ENV: "production" }), /required in production/);
  assert.throws(
    () => profileIntakeHmacSecret({ NODE_ENV: "production", PROFILE_INTAKE_HMAC_SECRET: "too-short" }),
    /at least 32 bytes/
  );
  assert.equal(
    profileIntakeHmacSecret({ NODE_ENV: "production", PROFILE_INTAKE_HMAC_SECRET: "a".repeat(32) }),
    "a".repeat(32)
  );
});

test("retains a non-production-only local fallback", () => {
  assert.equal(profileIntakeHmacSecret({ NODE_ENV: "development" }), "local-intake-development-secret");
});
