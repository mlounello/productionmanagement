import { createHash, randomBytes } from "node:crypto";
import { SITE_URL } from "@/lib/config";
import { sendHtmlEmail, renderTemplate } from "@/lib/outbound-email";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { activeEmailTemplate } from "@/lib/email-template-catalog";

const LINK_LIFETIME_DAYS = 7;
const DEFAULT_SUBJECT = "Your secure Siena Theatre production profile link";
const DEFAULT_BODY = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#24352e">
<h1 style="color:#006b54">Siena Theatre Production Management</h1>
<p>Hello {{person_name}},</p>
<p>You have been invited to review and update your Siena Theatre production profile, including your contact information, publicity bio, and headshot.</p>
<p style="margin:32px 0"><a href="{{profile_access_url}}" style="background:#006b54;color:#fff;padding:14px 22px;border-radius:6px;text-decoration:none;font-weight:bold">Open My Production Profile</a></p>
<p>The access page will ask you to press Continue before opening your private session. This link is already connected to the email address where this message was delivered, so you will not need to enter an email address or create an account.</p>
<p>This link expires in {{expires_in}} and should not be forwarded. If you did not expect this message, you may safely ignore it.</p>
<p>Thank you,<br>Siena Theatre</p>
</div>`;
const DEFAULT_REMINDER_SUBJECT = "Publicity items due for {{project_title}}";
const DEFAULT_REMINDER_BODY = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#24352e">
<h1 style="color:#006b54">{{project_title}} Publicity</h1>
<p>Hello {{person_name}},</p>
<p>This is a reminder to review your production publicity information for <strong>{{project_title}}</strong>.</p>
<p><strong>Still needed:</strong> {{outstanding_items}}</p>
<ul><li>Bio due: {{bio_due_date}}</li><li>Headshot due: {{headshot_due_date}}</li></ul>
<p style="margin:32px 0"><a href="{{profile_access_url}}" style="background:#006b54;color:#fff;padding:14px 22px;border-radius:6px;text-decoration:none;font-weight:bold">Review My Publicity Profile</a></p>
<p>No password or account setup is required. This private link expires in {{expires_in}} and should not be forwarded.</p>
<p>Thank you,<br>Siena Theatre</p>
</div>`;

export function hashProfileAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function activeTemplate(templateType = "profile_access", projectId: string | null = null) {
  const data = await activeEmailTemplate(templateType === "publicity_reminder" ? "publicity_reminder" : "profile_access",projectId);
  if (data) return { subject: data.subject_template, body: data.body_template };
  if (projectId) return activeTemplate(templateType, null);
  return templateType === "publicity_reminder"
    ? { subject: DEFAULT_REMINDER_SUBJECT, body: DEFAULT_REMINDER_BODY }
    : { subject: DEFAULT_SUBJECT, body: DEFAULT_BODY };
}

export async function createProfileAccessUrl(person: { id: string; email: string }, actorUserId: string | null,destinationPath="/my-profile") {
  const admin = createSupabaseAdminClient();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: access, error } = await admin.from("profile_access_links").insert({
    person_id: person.id,
    email: person.email,
    token_hash: hashProfileAccessToken(token),
    expires_at: expiresAt,
    created_by: actorUserId,
    destination_path:destinationPath.startsWith("/")&&!destinationPath.startsWith("//")?destinationPath:"/my-profile"
  }).select("id").single();
  if (error) throw new Error(error.message);
  return { accessId: String(access.id), url: `${SITE_URL.replace(/\/+$/, "")}/profile-access/${token}` };
}

export async function sendBrandedProfileAccessLink(personId: string, actorUserId: string | null) {
  const admin = createSupabaseAdminClient();
  const { data: person, error: personError } = await admin.from("people")
    .select("id, full_name, preferred_name, email")
    .eq("id", personId)
    .maybeSingle();
  if (personError || !person) throw new Error(personError?.message ?? "Person not found.");
  const email = String(person.email ?? "").trim().toLowerCase();
  if (!email) throw new Error("Add an email address before sending profile access.");

  const access = await createProfileAccessUrl({ id: String(person.id), email }, actorUserId);
  const variables = {
    person_name: String(person.preferred_name || person.full_name),
    profile_access_url: access.url,
    expires_in: `${LINK_LIFETIME_DAYS} days`
  };
  const template = await activeTemplate();
  try {
    const delivery = await sendHtmlEmail({
      to: email,
      subject: renderTemplate(template.subject, variables),
      html: renderTemplate(template.body, variables, true)
    });
    return { email, accessId: access.accessId, providerId: delivery.id };
  } catch (error) {
    await admin.from("profile_access_links").delete().eq("id", access.accessId);
    throw error;
  }
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

export async function sendPublicityReminder(personId: string, projectId: string, actorUserId: string | null) {
  const admin = createSupabaseAdminClient();
  const [{ data: person }, { data: project }, { data: submission }, { data: settings }] = await Promise.all([
    admin.from("people").select("id, full_name, preferred_name, email").eq("id", personId).maybeSingle(),
    admin.from("projects").select("id, title").eq("id", projectId).maybeSingle(),
    admin.from("project_publicity_submissions").select("id, bio, headshot_url, status, playbill_submission_status, reminder_count, bio_required").eq("project_id", projectId).eq("person_id", personId).maybeSingle(),
    admin.from("project_publicity_settings").select("bio_due_on, headshot_due_on, reminders_enabled, bio_character_limit").eq("project_id", projectId).maybeSingle()
  ]);
  if (!person || !project || !submission) throw new Error("The publicity reminder record could not be found.");
  if (settings && !settings.reminders_enabled) throw new Error("Publicity reminders are disabled for this project.");
  if (submission.bio_required === false) throw new Error("This person is marked bio not required and cannot receive publicity reminders.");
  if (submission.playbill_submission_status === "locked") throw new Error("This submission is locked in Playbill.");
  const email = String(person.email ?? "").trim().toLowerCase();
  if (!email) throw new Error("Add an email address before sending this reminder.");

  const outstanding = [
    !String(submission.bio ?? "").trim() ? "show-specific bio" : null,
    !String(submission.headshot_url ?? "").trim() ? "headshot" : null,
    !["person_approved", "approved"].includes(String(submission.status)) ? "your approval" : null
  ].filter(Boolean) as string[];
  if (!outstanding.length) throw new Error("This person has no outstanding publicity items.");

  const access = await createProfileAccessUrl({ id: String(person.id), email }, actorUserId);
  const variables = {
    person_name: String(person.preferred_name || person.full_name),
    project_title: String(project.title),
    outstanding_items: outstanding.join(", "),
    bio_due_date: dateLabel(settings?.bio_due_on),
    headshot_due_date: dateLabel(settings?.headshot_due_on),
    profile_access_url: access.url,
    expires_in: `${LINK_LIFETIME_DAYS} days`
  };
  const template = await activeTemplate("publicity_reminder", projectId);
  const subject = renderTemplate(template.subject, variables);
  const html = renderTemplate(template.body, variables, true);
  let delivery: { id: string };
  try { delivery = await sendHtmlEmail({ to: email, subject, html }); }
  catch (error) {
    await admin.from("profile_access_links").delete().eq("id", access.accessId);
    await admin.from("email_messages").insert({
      project_id: projectId, person_id: personId, message_type: "publicity_reminder", to_email: email,
      subject, body: html, status: "failed", created_by: actorUserId
    });
    throw error;
  }
  // Once Resend accepts the message, keep its access token valid even if an
  // audit write has a transient issue. The recipient must never receive a dead
  // link merely because bookkeeping failed after delivery.
  try {
    await admin.from("email_messages").insert({
      project_id: projectId, person_id: personId, message_type: "publicity_reminder", to_email: email,
      subject, body: html, status: "sent", provider_message_id: delivery.id, sent_at: new Date().toISOString(), created_by: actorUserId
    });
    await admin.from("project_publicity_submissions").update({
      last_reminder_sent_at: new Date().toISOString(), reminder_count: Number(submission.reminder_count ?? 0) + 1
    }).eq("id", submission.id);
  } catch {
    // Delivery succeeded; logging must not invalidate the link or report a false
    // send failure to the production manager.
  }
  return { email, providerId: delivery.id };
}

export async function sendProfileAccessForEmail(email: string) {
  const admin = createSupabaseAdminClient();
  const normalized = email.trim().toLowerCase();
  const { data: person } = await admin.from("people").select("id").ilike("email", normalized).maybeSingle();
  if (!person) return false;
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: recent } = await admin.from("profile_access_links").select("id").eq("person_id", person.id).gte("created_at", cutoff).limit(1);
  if (recent?.length) return true;
  await sendBrandedProfileAccessLink(String(person.id), null);
  return true;
}

export async function getProfileAccessLink(token: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("profile_access_links")
    .select("id, person_id, email, expires_at, used_at, destination_path, people(full_name, preferred_name)")
    .eq("token_hash", hashProfileAccessToken(token))
    .maybeSingle();
  if (!data || data.used_at || new Date(String(data.expires_at)).getTime() <= Date.now()) return null;
  return data;
}

export async function consumeProfileAccessLink(token: string) {
  const admin = createSupabaseAdminClient();
  const access = await getProfileAccessLink(token);
  if (!access) throw new Error("This profile access link has expired or has already been used.");

  let generated: { hashedToken: string; type: "magiclink" | "invite" } | null = null;
  for (const type of ["magiclink", "invite"] as const) {
    const { data, error } = await admin.auth.admin.generateLink({ type, email: String(access.email) });
    const hashedToken = String(data?.properties?.hashed_token ?? "").trim();
    if (!error && hashedToken) { generated = { hashedToken, type }; break; }
  }
  if (!generated) throw new Error("A secure profile session could not be created.");

  const { data: claimed, error: claimError } = await admin.from("profile_access_links")
    .update({ used_at: new Date().toISOString() })
    .eq("id", access.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (claimError || !claimed) throw new Error("This profile access link has already been used.");

  // This callback verifies the one-time token directly and persists the returned
  // session. It deliberately does not use the PKCE `code` exchange, because the
  // branded link may be opened on a different browser/device than the server
  // process that generated it.
  const callback = new URL(`${SITE_URL.replace(/\/+$/, "")}/auth/profile-access`);
  callback.searchParams.set("next", String(access.destination_path||"/my-profile"));
  callback.searchParams.set("token_hash", generated.hashedToken);
  callback.searchParams.set("type", generated.type);
  return callback.toString();
}

export const defaultProfileAccessTemplate = { subject: DEFAULT_SUBJECT, body: DEFAULT_BODY };
export const defaultPublicityReminderTemplate = { subject: DEFAULT_REMINDER_SUBJECT, body: DEFAULT_REMINDER_BODY };
