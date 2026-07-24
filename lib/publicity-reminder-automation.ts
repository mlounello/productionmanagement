import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { sendPublicityReminder } from "@/lib/profile-access-links";
import { publicityReminderDecision } from "@/lib/publicity-reminder-policy";

type PublicitySettingsRow = {
  project_id: string;
  bio_due_on: string | null;
  headshot_due_on: string | null;
  reminders_enabled: boolean;
  reminder_automation_enabled: boolean;
  reminder_cadence_days: number;
  reminder_send_last_day: boolean;
};

type SubmissionRow = {
  id: string;
  project_id: string;
  person_id: string;
  bio: string;
  headshot_url: string;
  status: string;
  playbill_submission_status: string;
  bio_required: boolean;
  last_reminder_sent_at: string | null;
  people: { email: string } | null;
};

export type AutomaticPublicityReminderResult = {
  projectsChecked: number;
  submissionsChecked: number;
  eligible: number;
  sent: number;
  failed: number;
  duplicatesSkipped: number;
  skipped: Record<string, number>;
};

function increment(bucket: Record<string, number>, key: string) {
  bucket[key] = (bucket[key] ?? 0) + 1;
}

export async function runAutomaticPublicityReminders(now = new Date()): Promise<AutomaticPublicityReminderResult> {
  const admin = createSupabaseAdminClient();
  const result: AutomaticPublicityReminderResult = {
    projectsChecked: 0,
    submissionsChecked: 0,
    eligible: 0,
    sent: 0,
    failed: 0,
    duplicatesSkipped: 0,
    skipped: {}
  };
  const scheduledFor = now.toISOString().slice(0, 10);
  const { data: settingsRows, error: settingsError } = await admin
    .from("project_publicity_settings")
    .select("project_id,bio_due_on,headshot_due_on,reminders_enabled,reminder_automation_enabled,reminder_cadence_days,reminder_send_last_day")
    .eq("reminders_enabled", true)
    .eq("reminder_automation_enabled", true);
  if (settingsError) throw new Error(`Could not load publicity reminder settings: ${settingsError.message}`);

  for (const settings of (settingsRows ?? []) as PublicitySettingsRow[]) {
    result.projectsChecked += 1;
    const sentBeforeProject = result.sent;
    const failedBeforeProject = result.failed;
    const { data: submissionRows, error: submissionsError } = await admin
      .from("project_publicity_submissions")
      .select("id,project_id,person_id,bio,headshot_url,status,playbill_submission_status,bio_required,last_reminder_sent_at,people(email)")
      .eq("project_id", settings.project_id);
    if (submissionsError) {
      result.failed += 1;
      increment(result.skipped, "project_query_failed");
      await admin.from("project_publicity_settings").update({
        last_automatic_reminder_run_at: now.toISOString(),
        last_automatic_reminder_result: { status: "failed", error: submissionsError.message, scheduled_for: scheduledFor }
      }).eq("project_id", settings.project_id);
      continue;
    }

    for (const submission of (submissionRows ?? []) as unknown as SubmissionRow[]) {
      result.submissionsChecked += 1;
      const decision = publicityReminderDecision({
        remindersEnabled: settings.reminders_enabled,
        automationEnabled: settings.reminder_automation_enabled,
        cadenceDays: settings.reminder_cadence_days,
        sendLastDay: settings.reminder_send_last_day,
        bioDueOn: settings.bio_due_on,
        headshotDueOn: settings.headshot_due_on
      }, {
        bio: String(submission.bio ?? ""),
        headshotUrl: String(submission.headshot_url ?? ""),
        status: String(submission.status ?? "draft"),
        playbillStatus: String(submission.playbill_submission_status ?? "pending"),
        bioRequired: submission.bio_required !== false,
        lastReminderSentAt: submission.last_reminder_sent_at
      }, now);
      if (!decision.eligible) {
        increment(result.skipped, decision.reason);
        continue;
      }

      result.eligible += 1;
      const email = String(submission.people?.email ?? "").trim().toLowerCase();
      const { data: dispatch, error: claimError } = await admin.from("publicity_reminder_dispatches").insert({
        project_id: submission.project_id,
        submission_id: submission.id,
        scheduled_for: scheduledFor,
        reason: decision.reason,
        status: "sending",
        to_email: email
      }).select("id").single();
      if (claimError?.code === "23505") {
        result.duplicatesSkipped += 1;
        continue;
      }
      if (claimError || !dispatch) {
        result.failed += 1;
        increment(result.skipped, "dispatch_claim_failed");
        continue;
      }

      try {
        const delivery = await sendPublicityReminder(submission.person_id, submission.project_id, null, {
          mode: "automatic",
          idempotencyKey: `pm-publicity-${submission.id}-${scheduledFor}`
        });
        result.sent += 1;
        await admin.from("publicity_reminder_dispatches").update({
          status: "sent",
          provider_message_id: delivery.providerId,
          error_message: ""
        }).eq("id", dispatch.id);
      } catch (error) {
        result.failed += 1;
        await admin.from("publicity_reminder_dispatches").update({
          status: "failed",
          error_message: error instanceof Error ? error.message : "Unknown publicity reminder error."
        }).eq("id", dispatch.id);
      }
    }

    await admin.from("project_publicity_settings").update({
      last_automatic_reminder_run_at: now.toISOString(),
      last_automatic_reminder_result: {
        status: "complete",
        scheduled_for: scheduledFor,
        sent: result.sent - sentBeforeProject,
        failed: result.failed - failedBeforeProject
      }
    }).eq("project_id", settings.project_id);
  }
  return result;
}
