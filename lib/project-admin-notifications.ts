import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { deliverQueuedEmails, queueHtmlEmail } from "@/lib/outbound-email-queue";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

export async function notifyProjectManagers(input: { projectId: string; personId?: string; offerId?: string; eventType?: string; subject: string; heading: string; message: string; actionLabel: string; actionPath: string; idempotencyKey: string }) {
  const admin = createSupabaseAdminClient();
  const [{ data: project }, { data: configured }] = await Promise.all([
    admin.from("projects").select("title").eq("id", input.projectId).maybeSingle(),
    admin.from("project_notification_recipients").select("email").eq("project_id", input.projectId).eq("enabled", true)
  ]);
  const emails = [...new Set((configured?.length ? configured.map((row) => row.email) : [process.env.PM_ADMIN_NOTIFICATION_EMAIL || "mlounello@siena.edu"]).map((email) => String(email).trim().toLowerCase()).filter((email) => email.includes("@")))];
  const inserted = await admin.from("project_notifications").upsert({ project_id: input.projectId, person_id: input.personId ?? null, offer_id: input.offerId ?? null, event_type: input.eventType ?? "needs_review", title: input.heading, message: input.message, action_path: input.actionPath, dedupe_key: input.idempotencyKey }, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id").maybeSingle();
  if (inserted.error) throw new Error("The administrator notification could not be saved.");
  let notificationId = inserted.data?.id;
  if (!notificationId) notificationId = (await admin.from("project_notifications").select("id").eq("dedupe_key", input.idempotencyKey).maybeSingle()).data?.id;
  if (!notificationId) throw new Error("The administrator notification could not be verified.");
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://productionmanagement.mlounello.com").replace(/\/+$/, "");
  const url = `${base}${input.actionPath}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#17231f"><p style="color:#236848;font-weight:700">${escapeHtml(project?.title ?? "Production Management")}</p><h1 style="font-size:24px">${escapeHtml(input.heading)}</h1><p style="font-size:16px;line-height:1.6">${escapeHtml(input.message)}</p><p><a href="${escapeHtml(url)}" style="display:inline-block;background:#236848;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">${escapeHtml(input.actionLabel)}</a></p><p style="color:#617068;font-size:13px">This item is also saved in the project notification hub.</p></div>`;
  for (const email of emails) {
    const job = await queueHtmlEmail({ to: email, subject: input.subject, html }, { idempotencyKey: `${input.idempotencyKey}:${email}`, projectId: input.projectId, personId: input.personId });
    await admin.from("project_notification_deliveries").upsert({ notification_id: notificationId, email, email_job_id: job.id, status: job.status, error_message: job.last_error }, { onConflict: "notification_id,email" });
    await admin.from("project_notifications").update({ email_job_id: job.id, email_status: job.status }).eq("id", notificationId);
    if (!["sent","failed","uncertain","cancelled"].includes(job.status)) await deliverQueuedEmails({ jobId: job.id, limit: 1 });
  }
  return { notificationId };
}
