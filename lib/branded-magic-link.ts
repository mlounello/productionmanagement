import { createHash, randomUUID } from "node:crypto";
import { APP_ID } from "@/lib/config";
import { sendHtmlEmail } from "@/lib/outbound-email";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type Bucket = { count: number; resetAt: number };
type MagicLinkGlobal = typeof globalThis & {
  __productionMagicLinkBuckets?: Map<string, Bucket>;
};

const bucketStore = globalThis as MagicLinkGlobal;
const buckets = bucketStore.__productionMagicLinkBuckets ?? new Map<string, Bucket>();
bucketStore.__productionMagicLinkBuckets = buckets;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function consumeBucket(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}

export function allowProductionMagicLinkRequest(email: string, clientAddress: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const emailAllowed = consumeBucket(`email:${digest(normalized)}`, 1, 60_000);
  const clientAllowed = consumeBucket(`client:${digest(clientAddress || "unknown")}`, 5, 10 * 60_000);
  return emailAllowed && clientAllowed;
}

async function findAuthUserId(email: string) {
  const admin = createSupabaseAdminClient();
  const target = normalizeEmail(email);
  const perPage = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = (data.users ?? []).find((user) => normalizeEmail(user.email ?? "") === target);
    if (found) return found.id;
    if ((data.users ?? []).length < perPage) return null;
  }
  return null;
}

async function hasStaffAccess(userId: string) {
  const admin = createSupabaseAdminClient();
  const coreMembership = await admin
    .schema("core")
    .from("app_memberships")
    .select("user_id")
    .eq("user_id", userId)
    .eq("app_id", APP_ID)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (coreMembership.error) throw coreMembership.error;
  return Boolean(coreMembership.data);
}

async function createDirectLink(email: string, redirectTo: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  const tokenHash = String(data?.properties?.hashed_token ?? "").trim();
  if (error || !tokenHash) throw error ?? new Error("Supabase did not return a magic-link token.");
  const callback = new URL(redirectTo);
  callback.searchParams.set("token_hash", tokenHash);
  callback.searchParams.set("type", "magiclink");
  return callback.toString();
}

export async function sendAuthorizedProductionMagicLink(email: string, redirectTo: string) {
  const normalized = normalizeEmail(email);
  const userId = await findAuthUserId(normalized);
  if (!userId || !(await hasStaffAccess(userId))) return;
  const link = await createDirectLink(normalized, redirectTo);
  await sendHtmlEmail(
    {
      to: normalized,
      subject: "Your Production Management sign-in link",
      html:
        `<h2>Sign in to Production Management</h2>` +
        `<p>Use the one-time link below to open the Siena Production Management workspace.</p>` +
        `<p><a href="${link}">Open Production Management</a></p>` +
        `<p>If you did not request this link, you can ignore this email.</p>`,
    },
    { idempotencyKey: `production-magic-${randomUUID()}` }
  );
}
