import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node's built-in TypeScript loader requires the extension.
import { publicityReminderDecision } from "../lib/publicity-reminder-policy.ts";

const settings = {
  remindersEnabled: true,
  automationEnabled: true,
  cadenceDays: 7,
  sendLastDay: true,
  bioDueOn: "2026-08-15",
  headshotDueOn: "2026-08-20"
};
const submission = {
  bio: "",
  headshotUrl: "",
  status: "draft",
  playbillStatus: "pending",
  bioRequired: true,
  lastReminderSentAt: null
};

test("sends an initial reminder for incomplete publicity", () => {
  const decision = publicityReminderDecision(settings, submission, new Date("2026-08-01T13:00:00Z"));
  assert.equal(decision.eligible, true);
  assert.equal(decision.reason, "eligible_cadence");
  assert.deepEqual(decision.outstanding, ["show-specific bio", "headshot", "your approval"]);
  assert.equal(decision.dueOn, "2026-08-15");
});

test("uses Playbill's seven-day cadence window", () => {
  const recent = publicityReminderDecision(settings, {
    ...submission,
    lastReminderSentAt: "2026-08-01T13:00:00Z"
  }, new Date("2026-08-05T13:00:00Z"));
  assert.equal(recent.reason, "sent_recently");

  const dueAgain = publicityReminderDecision(settings, {
    ...submission,
    lastReminderSentAt: "2026-08-01T13:00:00Z"
  }, new Date("2026-08-08T13:00:00Z"));
  assert.equal(dueAgain.reason, "eligible_cadence");
});

test("due-date follow-up overrides a recent cadence reminder", () => {
  const decision = publicityReminderDecision(settings, {
    ...submission,
    lastReminderSentAt: "2026-08-14T13:00:00Z"
  }, new Date("2026-08-15T13:00:00Z"));
  assert.equal(decision.eligible, true);
  assert.equal(decision.reason, "eligible_due_date");
  assert.equal(decision.dueDateReminder, true);
});

test("never reminds complete, locked, or skipped records", () => {
  assert.equal(publicityReminderDecision(settings, {
    ...submission,
    bioRequired: false
  }).reason, "not_required");
  assert.equal(publicityReminderDecision(settings, {
    ...submission,
    playbillStatus: "locked"
  }).reason, "locked");
  assert.equal(publicityReminderDecision(settings, {
    ...submission,
    bio: "<p>Ready.</p>",
    headshotUrl: "https://example.com/headshot.jpg",
    status: "person_approved"
  }).reason, "complete");
});

test("honors both project reminder switches", () => {
  assert.equal(publicityReminderDecision({ ...settings, remindersEnabled: false }, submission).reason, "reminders_disabled");
  assert.equal(publicityReminderDecision({ ...settings, automationEnabled: false }, submission).reason, "automation_disabled");
});
