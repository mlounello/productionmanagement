import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const SIENA_GMAIL_ADDRESS = "mlounello@siena.edu";
export const SIENA_GMAIL_FROM = `Siena Theatre Production Management <${SIENA_GMAIL_ADDRESS}>`;
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

function encryptionKey(secret: string) {
  if (secret.length < 32) throw new Error("Gmail encryption key must contain at least 32 characters.");
  return createHash("sha256").update(secret).digest();
}

export function sealGmailSecret(value: string, secret: string, purpose: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(`pm-gmail-v1:${purpose}`));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function openGmailSecret(value: string, secret: string, purpose: string) {
  const [version, iv, tag, data, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !data || extra) throw new Error("Invalid protected Gmail value.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(`pm-gmail-v1:${purpose}`));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export type GmailOAuthState = { state: string; verifier: string; userId: string; expiresAt: number };
export function validateGmailState(saved: GmailOAuthState, state: string, userId: string, now = Date.now()) {
  if (!saved || typeof saved.state !== "string" || typeof saved.verifier !== "string" || !saved.verifier ||
      !Number.isFinite(saved.expiresAt) || saved.expiresAt <= now || saved.expiresAt > now + 600_000 || saved.userId !== userId) return false;
  const left = Buffer.from(saved.state), right = Buffer.from(state);
  return left.length === right.length && left.length >= 32 && timingSafeEqual(left, right);
}

export function assertSienaGmailIdentity(identity: { email?: string; email_verified?: boolean }) {
  if (identity.email?.toLowerCase() !== SIENA_GMAIL_ADDRESS || identity.email_verified !== true) {
    throw new Error(`Connect the verified ${SIENA_GMAIL_ADDRESS} account, not a personal or other Google account.`);
  }
}

// Recipient is deliberately fixed for the connection-test phase. No actor can receive this message.
export function buildGmailTestMessage(html: string) {
  const boundary = `pm_${randomBytes(18).toString("hex")}`;
  const base64 = (text: string) => Buffer.from(text, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
  return Buffer.from([
    `From: ${SIENA_GMAIL_FROM}`, `To: ${SIENA_GMAIL_ADDRESS}`,
    "Subject: Production Management - Siena email connection test", "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`, "",
    `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
    base64("This is the Production Management Siena email test. No cast offers were sent. Connecting Gmail does not switch live delivery."),
    `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", base64(html),
    `--${boundary}--`, ""
  ].join("\r\n")).toString("base64url");
}
