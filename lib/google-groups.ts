import { JWT } from "google-auth-library";
import {
  ENABLE_GOOGLE_GROUP_AUTO_CREATE,
  GOOGLE_GROUP_DEFAULT_EXTERNAL_MEMBER_SUPPORT,
  GOOGLE_GROUP_DEFAULT_EXTERNAL_POSTING_SUPPORT,
  GOOGLE_GROUP_DOMAIN,
  GOOGLE_GROUP_EMAIL_SUFFIX
} from "@/lib/config";
import { generateGoogleGroupEmail as generateConfiguredGoogleGroupEmail } from "@/lib/google-group-naming.mjs";

const DIRECTORY_BASE = "https://admin.googleapis.com/admin/directory/v1";
const SETTINGS_BASE = "https://www.googleapis.com/groups/v1/groups";
const SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.group",
  "https://www.googleapis.com/auth/admin.directory.group.member",
  "https://www.googleapis.com/auth/apps.groups.settings"
];

export class GoogleWorkspaceError extends Error {
  status: number;
  response: Record<string, unknown>;
  constructor(message: string, status = 500, response: Record<string, unknown> = {}) {
    super(message); this.name = "GoogleWorkspaceError"; this.status = status; this.response = response;
  }
}

export function generateGoogleGroupEmail(projectSlug: string, roleGroupSlug: string, options?: { domain?: string; suffix?: string }) {
  return generateConfiguredGoogleGroupEmail(projectSlug, roleGroupSlug, { domain: options?.domain ?? GOOGLE_GROUP_DOMAIN, suffix: options?.suffix ?? GOOGLE_GROUP_EMAIL_SUFFIX });
}

function credentials() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL?.trim();
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const subject = process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL?.trim();
  if (!email || !key || !subject) throw new GoogleWorkspaceError("Google Workspace service-account credentials or delegated admin email are not configured.", 503);
  return { email, key, subject };
}

async function accessToken() {
  const { email, key, subject } = credentials();
  const client = new JWT({ email, key, subject, scopes: SCOPES });
  const token = await client.getAccessToken();
  if (!token.token) throw new GoogleWorkspaceError("Google did not return an access token.", 503);
  return token.token;
}

async function googleRequest(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  const response = await fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const nested = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : {};
    const message = String(nested.message ?? payload.message ?? `Google Workspace request failed (${response.status}).`);
    throw new GoogleWorkspaceError(message, response.status, { code: nested.code ?? response.status, status: nested.status ?? "", message });
  }
  return payload;
}

export async function getGoogleGroup(groupEmail: string) {
  try { return await googleRequest(`${DIRECTORY_BASE}/groups/${encodeURIComponent(groupEmail)}`); }
  catch (error) { if (error instanceof GoogleWorkspaceError && error.status === 404) return null; throw error; }
}

export async function configureGoogleGroup(groupEmail: string) {
  const allowExternal = GOOGLE_GROUP_DEFAULT_EXTERNAL_MEMBER_SUPPORT;
  const externalPosting = GOOGLE_GROUP_DEFAULT_EXTERNAL_POSTING_SUPPORT;
  return googleRequest(`${SETTINGS_BASE}/${encodeURIComponent(groupEmail)}`, {
    method: "PATCH",
    body: JSON.stringify({
      allowExternalMembers: allowExternal ? "true" : "false",
      whoCanAddExternalMembers: "ONLY_ADMINS_CAN_ADD_EXTERNAL_MEMBERS",
      whoCanPostMessage: externalPosting ? "ANYONE_CAN_POST" : "ALL_MEMBERS_CAN_POST",
      allowWebPosting: "true",
      messageModerationLevel: externalPosting ? "MODERATE_NON_MEMBERS" : "MODERATE_NONE",
      spamModerationLevel: "MODERATE"
    })
  });
}

export async function createOrAdoptGoogleGroup(input: { email: string; name: string; description: string }) {
  if (!ENABLE_GOOGLE_GROUP_AUTO_CREATE) throw new GoogleWorkspaceError("Automatic Google Group creation is disabled.", 503);
  const existing = await getGoogleGroup(input.email);
  let group = existing; let created = false;
  if (!group) {
    group = await googleRequest(`${DIRECTORY_BASE}/groups`, { method: "POST", body: JSON.stringify(input) });
    created = true;
  }
  let settingsWarning = "";
  try { await configureGoogleGroup(input.email); }
  catch (error) { settingsWarning = error instanceof Error ? error.message : "Could not apply Google Group posting settings."; }
  return { created, group, settingsWarning };
}

export async function hasGoogleGroupMember(groupEmail: string, memberEmail: string) {
  const result = await googleRequest(`${DIRECTORY_BASE}/groups/${encodeURIComponent(groupEmail)}/hasMember/${encodeURIComponent(memberEmail)}`);
  return Boolean(result.isMember);
}

export async function ensureGoogleGroupMember(groupEmail: string, memberEmail: string) {
  if (await hasGoogleGroupMember(groupEmail, memberEmail)) return { added: false, response: { alreadyMember: true } };
  const response = await googleRequest(`${DIRECTORY_BASE}/groups/${encodeURIComponent(groupEmail)}/members`, {
    method: "POST", body: JSON.stringify({ email: memberEmail, role: "MEMBER", delivery_settings: "ALL_MAIL" })
  });
  return { added: true, response };
}

export async function removeGoogleGroupMember(groupEmail: string, memberEmail: string) {
  if (!(await hasGoogleGroupMember(groupEmail, memberEmail))) return { removed: false, response: { alreadyAbsent: true } };
  const response = await googleRequest(`${DIRECTORY_BASE}/groups/${encodeURIComponent(groupEmail)}/members/${encodeURIComponent(memberEmail)}`, { method: "DELETE" });
  return { removed: true, response };
}

export async function testGoogleGroup(groupEmail: string) {
  const group = await getGoogleGroup(groupEmail);
  if (!group) throw new GoogleWorkspaceError("Google Group was not found.", 404);
  return group;
}
