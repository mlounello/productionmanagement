"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { communicationTypes, communicationTypeLabel, communicationVariables, renderCommunication, selectCommunicationCandidates, type AudienceSelection, type CommunicationCandidate } from "@/lib/communications";
import { sendHtmlEmail, sendHtmlEmailBatch } from "@/lib/outbound-email";
import { createHash } from "node:crypto";
import { sanitizeRichText, stripRichTextToPlain } from "@/lib/rich-text";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const uuid = z.string().uuid();
const typeSchema = z.enum(communicationTypes);

function route(projectId: string, kind: "success" | "error", message: string, campaignId?: string) {
  const params = new URLSearchParams({ [kind]: message });
  if (campaignId) params.set("campaign", campaignId);
  return `/projects/${projectId}/communications?${params}`;
}

async function requireCommunicationManager(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: projectAllowed }, { data: appAllowed }] = await Promise.all([
    supabase.rpc("has_project_role", { target_project_id: projectId, allowed_roles: ["project_manager", "producer", "department_head", "staff"] }),
    supabase.rpc("has_app_role", { allowed_roles: ["admin", "producer"] }),
  ]);
  if (!projectAllowed && !appAllowed) throw new Error("You do not have permission to manage project communications.");
}

async function loadCandidates(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: assignments, error: assignmentError }, { data: auditions, error: auditionError }] = await Promise.all([
    supabase.from("role_assignments").select("id, person_id, status, people(full_name, preferred_name, email), project_roles(name, role_group)").eq("project_id", projectId).not("status", "in", "(declined,withdrawn)"),
    supabase.from("audition_submissions").select("id, person_id, audition_status, people(full_name, preferred_name, email)").eq("project_id", projectId).not("status", "eq", "cancelled"),
  ]);
  if (assignmentError || auditionError) throw new Error(assignmentError?.message || auditionError?.message || "Could not load recipients.");
  const candidates: CommunicationCandidate[] = [];
  for (const row of assignments ?? []) {
    const person = row.people as unknown as { full_name: string; preferred_name: string; email: string } | null;
    const role = row.project_roles as unknown as { name: string; role_group: string } | null;
    candidates.push({ personId: String(row.person_id), assignmentId: String(row.id), email: person?.email ?? "", fullName: person?.full_name ?? "", preferredName: person?.preferred_name ?? "", roleName: role?.name ?? "", roleGroup: role?.role_group ?? "", assignmentStatus: String(row.status), auditionStatus: "" });
  }
  for (const row of auditions ?? []) {
    const person = row.people as unknown as { full_name: string; preferred_name: string; email: string } | null;
    candidates.push({ personId: String(row.person_id), auditionSubmissionId: String(row.id), email: person?.email ?? "", fullName: person?.full_name ?? "", preferredName: person?.preferred_name ?? "", roleName: "Audition applicant", roleGroup: "auditions", assignmentStatus: "", auditionStatus: String(row.audition_status) });
  }
  return candidates;
}

function audienceFrom(formData: FormData): AudienceSelection {
  const mode = z.enum(["all", "role_group", "assignment_status", "audition_status", "individual"]).parse(String(formData.get("audienceMode") ?? ""));
  return { mode, value: String(formData.get("audienceValue") ?? ""), personIds: formData.getAll("personId").map(String) };
}

export async function createCommunicationTemplateAction(formData: FormData) {
  await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  await requireCommunicationManager(projectId);
  const templateType = typeSchema.parse(String(formData.get("messageType") ?? "custom"));
  const name = z.string().trim().min(1).max(160).parse(String(formData.get("name") ?? ""));
  const subject = z.string().trim().min(1).max(300).parse(String(formData.get("subject") ?? ""));
  const body = sanitizeRichText(String(formData.get("bodyHtml") ?? ""));
  if (!stripRichTextToPlain(body)) redirect(route(projectId, "error", "Template message is required."));
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("email_templates").insert({ project_id: projectId, template_type: templateType, usage_tags:[templateType], name, subject_template: subject, body_template: body, active: true });
  if (error) redirect(route(projectId, "error", error.message));
  revalidatePath(`/projects/${projectId}/communications`);
  redirect(route(projectId, "success", "Reusable email template created."));
}

export async function createCommunicationDraftAction(formData: FormData) {
  const user = await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  await requireCommunicationManager(projectId);
  const messageType = typeSchema.parse(String(formData.get("messageType") ?? "custom"));
  const name = z.string().trim().min(1).max(160).parse(String(formData.get("name") ?? ""));
  const subjectTemplate = z.string().trim().min(1).max(300).parse(String(formData.get("subject") ?? ""));
  const bodyTemplate = sanitizeRichText(String(formData.get("bodyHtml") ?? ""));
  if (!stripRichTextToPlain(bodyTemplate)) redirect(route(projectId, "error", "Email message is required."));
  const selection = audienceFrom(formData);
  const supabase = await createSupabaseServerClient();
  const [{ data: project }, candidates] = await Promise.all([supabase.from("projects").select("title").eq("id", projectId).single(), loadCandidates(projectId)]);
  const selected = selectCommunicationCandidates(candidates, selection);
  if (!selected.length) redirect(route(projectId, "error", "No recipients with email addresses matched that audience."));
  if (selected.length > 500) redirect(route(projectId, "error", "A campaign may contain at most 500 recipients. Narrow the audience and create another draft."));
  const audienceDescription = selection.mode === "all" ? "All assigned people and audition applicants" : selection.mode === "individual" ? `${selected.length} selected people` : `${communicationTypeLabel(selection.mode)}: ${selection.value}`;
  const { data: campaign, error } = await supabase.from("communication_campaigns").insert({ project_id: projectId, template_id: String(formData.get("templateId") || "") || null, name, message_type: messageType, subject_template: subjectTemplate, body_template: bodyTemplate, audience_description: audienceDescription, audience_filter: selection, recipient_count: selected.length, created_by: user.id }).select("id").single();
  if (error || !campaign) redirect(route(projectId, "error", error?.message ?? "Could not create campaign draft."));
  const rows = selected.map((candidate) => {
    const rendered = renderCommunication(subjectTemplate, bodyTemplate, communicationVariables(candidate, project?.title ?? "this production"));
    return { campaign_id: campaign.id, person_id: candidate.personId, role_assignment_id: candidate.assignmentId ?? null, audition_submission_id: candidate.auditionSubmissionId ?? null, to_email: candidate.email, display_name: candidate.preferredName || candidate.fullName, role_name: candidate.roleName, role_group: candidate.roleGroup, subject: rendered.subject, body: rendered.body };
  });
  const { error: recipientError } = await supabase.from("communication_recipients").insert(rows);
  if (recipientError) { await supabase.from("communication_campaigns").delete().eq("id", campaign.id); redirect(route(projectId, "error", recipientError.message)); }
  revalidatePath(`/projects/${projectId}/communications`);
  redirect(route(projectId, "success", `Draft created for ${rows.length} recipient${rows.length === 1 ? "" : "s"}. Review it before sending.`, campaign.id));
}

export async function sendCommunicationTestAction(formData: FormData) {
  const user = await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  const campaignId = uuid.parse(String(formData.get("campaignId") ?? ""));
  const testEmail = z.string().trim().email().parse(String(formData.get("testEmail") ?? ""));
  await requireCommunicationManager(projectId);
  const supabase = await createSupabaseServerClient();
  const { data: recipient } = await supabase.from("communication_recipients").select("subject, body").eq("campaign_id", campaignId).order("created_at").limit(1).maybeSingle();
  if (!recipient) redirect(route(projectId, "error", "This draft has no preview recipient.", campaignId));
  const subject = `[TEST] ${recipient.subject}`;
  const body = `<div><strong>TEST ONLY</strong> — This preview was sent only to ${testEmail}.</div>${recipient.body}`;
  try {
    const provider = await sendHtmlEmail({ to: testEmail, subject, html: body });
    await supabase.from("email_messages").insert({ project_id: projectId, campaign_id: campaignId, message_type: "communication_test", to_email: testEmail, subject, body, status: "sent", provider_message_id: provider.id, sent_at: new Date().toISOString(), created_by: user.id });
  } catch (error) {
    await supabase.from("email_messages").insert({ project_id: projectId, campaign_id: campaignId, message_type: "communication_test", to_email: testEmail, subject, body, status: "failed", created_by: user.id });
    redirect(route(projectId, "error", error instanceof Error ? error.message : "Test email failed.", campaignId));
  }
  redirect(route(projectId, "success", `Test sent only to ${testEmail}. Campaign recipients were not contacted.`, campaignId));
}

export async function sendCommunicationCampaignAction(formData: FormData) {
  const user = await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  const campaignId = uuid.parse(String(formData.get("campaignId") ?? ""));
  if (formData.get("confirmSend") !== "on") redirect(route(projectId, "error", "Confirm that you reviewed the recipients and message before sending.", campaignId));
  await requireCommunicationManager(projectId);
  const supabase = await createSupabaseServerClient();
  const { data: campaign } = await supabase.from("communication_campaigns").select("id, message_type, status").eq("id", campaignId).eq("project_id", projectId).maybeSingle();
  if (!campaign || !["draft", "partial", "sending"].includes(campaign.status)) redirect(route(projectId, "error", "This campaign is not available to send.", campaignId));
  const { data: recipients, error } = await supabase.from("communication_recipients").select("id, person_id, to_email, subject, body, status").eq("campaign_id", campaignId).in("status", ["draft", "failed", "sending"]).order("display_name");
  if (error) redirect(route(projectId, "error", error.message, campaignId));
  if (!recipients?.length) {
    const { data: existing } = await supabase.from("communication_recipients").select("status").eq("campaign_id", campaignId);
    const existingSent = (existing ?? []).filter((row) => row.status === "sent").length;
    const existingFailed = (existing ?? []).filter((row) => row.status === "failed").length;
    await supabase.from("communication_campaigns").update({ status: existingFailed ? "partial" : "sent", sent_count: existingSent, failed_count: existingFailed, sent_at: existingSent ? new Date().toISOString() : null }).eq("id", campaignId);
    redirect(route(projectId, "success", "Campaign delivery states reconciled; no unsent recipients remain.", campaignId));
  }
  await supabase.from("communication_campaigns").update({ status: "sending", reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq("id", campaignId);
  for (let start = 0; start < recipients.length; start += 100) {
    const prepared = (await Promise.all(recipients.slice(start, start + 100).map(async (recipient) => {
      const { data: prior } = await supabase.from("email_messages").select("id").eq("campaign_recipient_id", recipient.id).eq("status", "sent").maybeSingle();
      if (prior) { await supabase.from("communication_recipients").update({ status: "sent", error_message: "" }).eq("id", recipient.id); return null; }
      await supabase.from("communication_recipients").update({ status: "sending", error_message: "" }).eq("id", recipient.id);
      const { data: message, error: messageError } = await supabase.from("email_messages").insert({ project_id: projectId, person_id: recipient.person_id, campaign_id: campaignId, campaign_recipient_id: recipient.id, message_type: campaign.message_type, to_email: recipient.to_email, subject: recipient.subject, body: recipient.body, status: "queued", created_by: user.id }).select("id").single();
      if (messageError || !message) { await supabase.from("communication_recipients").update({ status: "failed", error_message: messageError?.message ?? "Could not create email audit record." }).eq("id", recipient.id); return null; }
      return { recipient, message };
    }))).filter((item): item is NonNullable<typeof item> => item !== null);
    if (!prepared.length) continue;
    try {
      const stableIds = prepared.map(({ recipient }) => recipient.id).sort().join(",");
      const key = `pm-campaign-${campaignId}-${createHash("sha256").update(stableIds).digest("hex").slice(0, 32)}`;
      const providers = await sendHtmlEmailBatch(prepared.map(({ recipient }) => ({ to: recipient.to_email, subject: recipient.subject, html: recipient.body })), { idempotencyKey: key });
      await Promise.all(prepared.map(async ({ recipient, message }, index) => {
        const provider = providers[index];
        const now = new Date().toISOString();
        await Promise.all([supabase.from("email_messages").update({ status: "sent", provider_message_id: provider.id, sent_at: now }).eq("id", message.id), supabase.from("communication_recipients").update({ status: "sent", provider_message_id: provider.id, sent_at: now, error_message: "" }).eq("id", recipient.id)]);
      }));
    } catch (sendError) {
      const messageText = sendError instanceof Error ? sendError.message : "Email delivery failed.";
      await Promise.all(prepared.flatMap(({ recipient, message }) => [supabase.from("email_messages").update({ status: "failed" }).eq("id", message.id), supabase.from("communication_recipients").update({ status: "failed", error_message: messageText }).eq("id", recipient.id)]));
    }
  }
  const { data: final } = await supabase.from("communication_recipients").select("status").eq("campaign_id", campaignId);
  const sent = (final ?? []).filter((row) => row.status === "sent").length;
  const failed = (final ?? []).filter((row) => row.status === "failed").length;
  const status = failed ? "partial" : "sent";
  await supabase.from("communication_campaigns").update({ status, sent_count: sent, failed_count: failed, sent_at: sent ? new Date().toISOString() : null }).eq("id", campaignId);
  if (campaign.message_type === "recognition" && sent) await supabase.from("profile_accomplishments").update({ notified_at: new Date().toISOString() }).eq("announcement_campaign_id", campaignId);
  revalidatePath(`/projects/${projectId}/communications`);
  redirect(route(projectId, failed ? "error" : "success", failed ? `${sent} sent; ${failed} failed. Review errors and retry only failed recipients.` : `${sent} email${sent === 1 ? "" : "s"} sent.`, campaignId));
}

export async function cancelCommunicationCampaignAction(formData: FormData) {
  await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  const campaignId = uuid.parse(String(formData.get("campaignId") ?? ""));
  await requireCommunicationManager(projectId);
  const supabase = await createSupabaseServerClient();
  await supabase.from("communication_campaigns").update({ status: "cancelled" }).eq("id", campaignId).eq("project_id", projectId).in("status", ["draft", "partial", "sending"]);
  redirect(route(projectId, "success", "Campaign cancelled. No unsent recipients were contacted."));
}

export async function createRecognitionAction(formData: FormData) {
  const user = await requireUser();
  const projectId = uuid.parse(String(formData.get("projectId") ?? ""));
  const personId = uuid.parse(String(formData.get("personId") ?? ""));
  await requireCommunicationManager(projectId);
  const title = z.string().trim().min(1).max(200).parse(String(formData.get("title") ?? ""));
  const issuer = z.string().trim().max(180).parse(String(formData.get("issuer") ?? ""));
  const description = z.string().trim().max(4000).parse(String(formData.get("description") ?? ""));
  const accomplishmentType = z.string().trim().min(1).max(80).parse(String(formData.get("accomplishmentType") ?? "recognition"));
  const visibility = z.enum(["client_visible", "management_only"]).parse(String(formData.get("visibility") ?? "client_visible"));
  const prepare = formData.get("prepareAnnouncement") === "on";
  if (prepare && visibility === "management_only") redirect(route(projectId, "error", "A management-only accomplishment cannot be prepared as a recipient announcement."));
  const supabase = await createSupabaseServerClient();
  const { data: accomplishment, error } = await supabase.from("profile_accomplishments").insert({ person_id: personId, project_id: projectId, role_assignment_id: String(formData.get("roleAssignmentId") || "") || null, accomplishment_type: accomplishmentType, title, issuer, awarded_on: String(formData.get("awardedOn") || "") || null, description, visibility, created_by: user.id }).select("id").single();
  if (error || !accomplishment) redirect(route(projectId, "error", error?.message ?? "Could not save recognition."));
  if (!prepare) redirect(route(projectId, "success", "Recognition saved to the person’s durable profile."));
  const [{ data: project }, { data: person }] = await Promise.all([supabase.from("projects").select("title").eq("id", projectId).single(), supabase.from("people").select("full_name, preferred_name, email").eq("id", personId).single()]);
  if (!person?.email) redirect(route(projectId, "error", "Recognition was saved, but the person has no email address for an announcement."));
  const subjectTemplate = `Congratulations on {{recognition_title}}`;
  const bodyTemplate = `<h3>Congratulations, {{person_name}}!</h3><p>We are pleased to recognize you for <strong>{{recognition_title}}</strong>.</p><p>{{recognition_description}}</p><p>{{recognition_issuer}}</p>`;
  const { data: campaign } = await supabase.from("communication_campaigns").insert({ project_id: projectId, name: `${title} · ${person.preferred_name || person.full_name}`, message_type: "recognition", subject_template: subjectTemplate, body_template: bodyTemplate, audience_description: person.full_name, audience_filter: { mode: "individual", personIds: [personId] }, recipient_count: 1, created_by: user.id }).select("id").single();
  if (!campaign) redirect(route(projectId, "error", "Recognition was saved, but the announcement draft could not be created."));
  const candidate: CommunicationCandidate = { personId, email: person.email, fullName: person.full_name, preferredName: person.preferred_name, roleName: "", roleGroup: "", assignmentStatus: "", auditionStatus: "" };
  const rendered = renderCommunication(subjectTemplate, bodyTemplate, communicationVariables(candidate, project?.title ?? "this production", { recognition_title: title, recognition_issuer: issuer, recognition_date: String(formData.get("awardedOn") || ""), recognition_description: description }));
  await supabase.from("communication_recipients").insert({ campaign_id: campaign.id, person_id: personId, to_email: person.email, display_name: person.preferred_name || person.full_name, subject: rendered.subject, body: rendered.body });
  await supabase.from("profile_accomplishments").update({ announcement_campaign_id: campaign.id }).eq("id", accomplishment.id);
  redirect(route(projectId, "success", "Recognition saved and announcement draft prepared for review.", campaign.id));
}
