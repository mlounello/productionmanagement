import { ENABLE_GOOGLE_GROUP_MEMBERSHIP_CHECK } from "@/lib/config";

export type MembershipCheck = { groupEmail: string; memberEmail: string };
export type MembershipResult = MembershipCheck & { isMember: boolean; error: string };

function bridgeConfig() {
  const url = process.env.GOOGLE_GROUPS_APPS_SCRIPT_URL?.trim() ?? "";
  const secret = process.env.GOOGLE_GROUPS_APPS_SCRIPT_SHARED_SECRET?.trim() ?? "";
  if (!ENABLE_GOOGLE_GROUP_MEMBERSHIP_CHECK) throw new Error("Google Group membership checking is disabled.");
  if (!url || !secret) throw new Error("Google Groups Apps Script URL or shared secret is not configured.");
  if (!url.startsWith("https://script.google.com/") && !url.startsWith("https://script.googleusercontent.com/")) throw new Error("Google Groups Apps Script URL is invalid.");
  return { url, secret };
}

async function request(payload: Record<string, unknown>) {
  const { url, secret } = bridgeConfig();
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...payload, secret }), cache: "no-store", redirect: "follow" });
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || result.ok !== true) throw new Error(String(result.error ?? `Apps Script membership check failed (${response.status}).`));
  return result;
}

export async function testGoogleGroupMembershipAccess(groupEmail: string) {
  return request({ action: "check_group", groupEmail: groupEmail.trim().toLowerCase() });
}

export async function checkGoogleGroupMembershipBatch(checks: MembershipCheck[]): Promise<MembershipResult[]> {
  if (!checks.length) return [];
  if (checks.length > 200) throw new Error("A maximum of 200 memberships can be checked at once.");
  const result = await request({ action: "check_memberships", checks: checks.map((check) => ({ groupEmail: check.groupEmail.trim().toLowerCase(), memberEmail: check.memberEmail.trim().toLowerCase() })) });
  return Array.isArray(result.results) ? result.results as MembershipResult[] : [];
}

export async function checkGoogleGroupMembership(groupEmail: string, memberEmail: string) {
  const [result] = await checkGoogleGroupMembershipBatch([{ groupEmail, memberEmail }]);
  if (!result) throw new Error("Apps Script did not return a membership result.");
  if (result.error) throw new Error(result.error);
  return result.isMember;
}
