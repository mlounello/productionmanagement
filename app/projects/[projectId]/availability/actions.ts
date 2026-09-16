"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createProfileAccessUrl } from "@/lib/profile-access-links";
import { sendHtmlEmail } from "@/lib/outbound-email";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const inputSchema = z.object({ projectId: z.string().uuid(), personId: z.string().uuid() });
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));

async function managerContext(projectId: string) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const [{ data: projectRole }, { data: appRole }] = await Promise.all([
    supabase.rpc("has_project_role", { target_project_id: projectId, allowed_roles: ["project_manager", "producer"] }),
    supabase.rpc("has_app_role", { allowed_roles: ["admin", "producer"] }),
  ]);
  if (!projectRole && !appRole) throw new Error("Project manager access is required.");
  return { user, admin: createSupabaseAdminClient() };
}

export async function grantAvailabilityViewerAction(formData: FormData): Promise<{ error?: string; success?: string }> {
  const parsed = inputSchema.safeParse({ projectId: formData.get("projectId"), personId: formData.get("personId") });
  if (!parsed.success) return { error: "Choose a company member to invite." };
  try {
    const { user, admin } = await managerContext(parsed.data.projectId);
    const [{ data: person }, { data: project }] = await Promise.all([
      admin.from("people").select("id,full_name,preferred_name,email").eq("id", parsed.data.personId).maybeSingle(),
      admin.from("projects").select("title").eq("id", parsed.data.projectId).maybeSingle(),
    ]);
    if (!person || !project) return { error: "The company member or project could not be found." };
    const email = String(person.email ?? "").trim().toLowerCase();
    if (!email) return { error: "Add an email address to this person before sending access." };
    const saved = await admin.from("project_availability_viewers").upsert({ project_id: parsed.data.projectId, person_id: person.id, granted_by: user.id, active: true }, { onConflict: "project_id,person_id" });
    if (saved.error) return { error: saved.error.message };
    const access = await createProfileAccessUrl({ id: String(person.id), email }, user.id, `/projects/${parsed.data.projectId}/availability`);
    const subject = `${project.title} company availability access`;
    const name = person.preferred_name || person.full_name || "Production team member";
    const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#24352e"><h1 style="color:#006b54">Siena Theatre Production Management</h1><p>Hello ${escape(name)},</p><p>You have been granted read-only access to the live company availability and conflict calendar for <strong>${escape(project.title)}</strong>.</p><p style="margin:32px 0"><a href="${escape(access.url)}" style="background:#006b54;color:#fff;padding:14px 22px;border-radius:6px;text-decoration:none;font-weight:bold">Open Company Availability</a></p><p>No registration or password setup is required. This private link securely connects the profile associated with ${escape(email)} and opens the project viewer.</p><p>The link expires in 7 days and should not be forwarded. After connecting, the Company Availability page remains available through Production Management.</p><p>Thank you,<br>Siena Theatre</p></div>`;
    try {
      const sent = await sendHtmlEmail({ to: email, subject, html }, { idempotencyKey: `availability-access-${parsed.data.projectId}-${person.id}-${access.accessId}` });
      await admin.from("email_messages").insert({ project_id: parsed.data.projectId, person_id: person.id, message_type: "availability_access_invite", to_email: email, subject, body: html, status: "sent", provider_message_id: sent.id, sent_at: new Date().toISOString(), created_by: user.id });
    } catch (error) {
      await admin.from("profile_access_links").delete().eq("id", access.accessId);
      return { error: `Viewer access was saved, but the invitation could not be sent: ${error instanceof Error ? error.message : "email failed"}` };
    }
    revalidatePath(`/projects/${parsed.data.projectId}/availability`);
    return { success: `${person.full_name} can now open Company Availability. A secure invitation was sent to ${email}.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Availability access could not be granted." };
  }
}

export async function removeAvailabilityViewerAction(formData: FormData): Promise<{ error?: string; success?: string }> {
  const parsed = inputSchema.safeParse({ projectId: formData.get("projectId"), personId: formData.get("personId") });
  if (!parsed.success) return { error: "Viewer access could not be identified." };
  try {
    const { admin } = await managerContext(parsed.data.projectId);
    const { error } = await admin.from("project_availability_viewers").update({ active: false }).eq("project_id", parsed.data.projectId).eq("person_id", parsed.data.personId);
    if (error) return { error: error.message };
    revalidatePath(`/projects/${parsed.data.projectId}/availability`);
    return { success: "Company Availability access removed." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Viewer access could not be removed." };
  }
}
