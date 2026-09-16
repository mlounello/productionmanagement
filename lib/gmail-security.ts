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
  return buildGmailMessage({ to: SIENA_GMAIL_ADDRESS, subject: "Production Management - Siena email connection test", html });
}

function header(value: string, label: string) {
  if (!value.trim() || /[\r\n]/.test(value)) throw new Error(`Invalid email ${label}.`);
  return value.trim();
}

export function buildGmailMessage(input: { to: string; subject: string; html: string; messageId?: string }) {
  const boundary = `pm_${randomBytes(18).toString("hex")}`;
  const base64 = (text: string) => Buffer.from(text, "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
  const plain = input.html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>|<\/li>|<\/h[1-6]>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#0*39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/[ \t]+/g, " ").replace(/\n\s+/g, "\n").trim();
  return Buffer.from([
    `From: ${SIENA_GMAIL_FROM}`, `To: ${header(input.to, "recipient")}`,
    `Subject: =?UTF-8?B?${Buffer.from(header(input.subject, "subject"), "utf8").toString("base64")}?=`,
    ...(input.messageId ? [`Message-ID: <${header(input.messageId, "message identifier")}>`] : []), "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`, "",
    `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
    base64(plain),
    `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", base64(input.html),
    `--${boundary}--`, ""
  ].join("\r\n")).toString("base64url");
}
