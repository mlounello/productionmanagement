import { DISABLE_OUTBOUND_EMAIL } from "@/lib/config";

export type TemplateVariables = Record<string, string>;

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export function renderTemplate(template: string, variables: TemplateVariables, html = false) {
  return template.replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_match, key: string) => html ? escapeHtml(variables[key] ?? "") : variables[key] ?? "");
}

export async function sendHtmlEmail(input: { to: string; subject: string; html: string }) {
  if (DISABLE_OUTBOUND_EMAIL) throw new Error("Outbound email is disabled.");
  const apiKey = process.env.RESEND_API_KEY?.trim(); const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new Error("Resend email credentials are not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html })
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(payload.message ?? `Email provider failed (${response.status}).`));
  return { id: String(payload.id ?? "") };
}
