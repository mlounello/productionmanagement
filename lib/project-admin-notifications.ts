import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { sendHtmlEmailBatch } from "@/lib/outbound-email";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

export async function notifyProjectManagers(input: { projectId: string; subject: string; heading: string; message: string; actionLabel: string; actionPath: string; idempotencyKey: string }) {
  const admin = createSupabaseAdminClient();
  const [{ data: project }, { data: memberships }] = await Promise.all([
    admin.from("projects").select("title").eq("id", input.projectId).maybeSingle(),
    admin.from("project_memberships").select("user_id").eq("project_id", input.projectId).eq("active", true).in("role", ["project_manager", "producer"])
  ]);
  const userIds = [...new Set((memberships ?? []).map((row) => String(row.user_id)).filter(Boolean))];
  if (!userIds.length) return;
  const { data: people } = await admin.from("people").select("email").in("auth_user_id", userIds);
  const emails = [...new Set((people ?? []).map((row) => String(row.email ?? "").trim().toLowerCase()).filter((email) => email.includes("@")))];
  if (!emails.length) return;
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://productionmanagement.mlounello.com").replace(/\/+$/, "");
  const url = `${base}${input.actionPath}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#17231f"><p style="color:#236848;font-weight:700">${escapeHtml(project?.title ?? "Production Management")}</p><h1 style="font-size:24px">${escapeHtml(input.heading)}</h1><p style="font-size:16px;line-height:1.6">${escapeHtml(input.message)}</p><p><a href="${escapeHtml(url)}" style="display:inline-block;background:#236848;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">${escapeHtml(input.actionLabel)}</a></p><p style="color:#617068;font-size:13px">This message was sent because this item now needs production-management review.</p></div>`;
  await sendHtmlEmailBatch(emails.map((to) => ({ to, subject: input.subject, html })), { idempotencyKey: input.idempotencyKey });
}
