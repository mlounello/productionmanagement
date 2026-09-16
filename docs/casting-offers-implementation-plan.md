# Casting, acceptance, and company release

Requirements agreed September 15, 2026. This document is a plan; it does not indicate that the features below are implemented or deployed.

## Implementation progress

The first local increment adds `/projects/[projectId]/casting`: searchable draft list, actor/role selection, editing drawer, understudy/swing coverage, formatted duties and notes, Ensemble invitation text, saved-details preview, capacity/email warnings, and reversible withdrawal/restoration. Drafts reference existing people and roles and do not create role assignments or trigger emails, publicity, or onboarding. Existing actor and agreement tables are not updated by this increment.

Database migration `202609160100_casting_drafts.sql` is additive and has been verified in a disposable local PostgreSQL 17 database. Database assertions cover duplicate drafts, cross-project role and coverage rejection, manager-only access, no application delete privilege, stale-revision protection, draft restoration, and preservation of an existing actor. Six behavior tests cover Ensemble capacity, duplicate assignment warnings, coverage requirements, and edit revisions. Existing multi-person-role, assignment-lifecycle, and automatic-publicity tests also pass.

The second local increment adds frozen offer revisions, secure public response links, accept/decline/discussion choices, server-validated acknowledgements, anticipated-credit wording, performance availability confirmation, and typed-name signature receipts. It adds acceptance progress, selected-actor manager release, review of conflicts/comments, an Overview notice, and append-only response/release events. A discussion request can later become acceptance without losing the earlier event. Draft edits invalidate prior links while retaining prior signatures. Release creates the official assignment and accepted legacy agreement in one transaction, using the existing role-capacity guard. Repeated release returns the same agreement and does not rerun onboarding. Failed provider work remains visible after release.

Both increments remain local; neither migration has been applied to production. `ENABLE_CASTING_RELEASE` defaults to false and must remain false until Gmail and onboarding verification are complete. Offer email sending, administrator email notifications, flexible availability, and the full live lifecycle test remain outstanding. Prepared offers do not reserve capacity; capacity is enforced at release, and the email stage still needs reservation checks before real offers are sent. The current database verification uses disposable fixtures for legacy tables, so production-schema integration and browser lifecycle verification remain required before activation.

The second migration passed isolated PostgreSQL assertions for no assignment on acceptance, mandatory acknowledgements, restricted response access, discussion history, superseded links, manager-only visibility, one-time release, and actor/signed-record preservation. Nine casting behavior tests pass, as do the existing assignment/publicity tests and the Next.js build.

## Release objective

The third local increment adds owner-only Siena Gmail connection and fixed-recipient testing at `/settings/email-delivery`, encrypted refresh-token storage, owner/session-bound expiring OAuth state with PKCE, strict Siena account verification, and a durable test-receipt log. Connecting does not switch live mail or send actor messages. Setup instructions are in `docs/siena-gmail-setup.md`. The delivery queue, full provider cutover, and administrator emails are still outstanding; this is a connection prerequisite, not completion of phase 5.

The fourth local increment adds a durable Gmail queue, conservative pacing and daily application cap, explicit rate-limit backoff, ambiguous-outcome holds, provider receipts, and a protected retry worker. It adds reviewed individual/bulk casting-offer sending, role-capacity reservation at send time, exact email previews, per-offer delivery state, persistent project notifications, and configurable notification-recipient storage with Mike as the initial fallback. Casting responses, releases, onboarding attention, and offer delivery failures create durable Overview items and administrator email attempts. Company release remains independently disabled.

Enable reviewed cast offers by the end of September 16, with tested public responses, production-manager release control, Siena Gmail sending, and administrator notifications. Extend existing role acceptance, role assignments, publicity, and onboarding rather than introducing a competing lifecycle. Preserve current production agreement text and existing live applicant links.

## Confirmed product decisions

- Students can accept, decline, or request a discussion. A discussion request leaves the offer pending and alerts the production manager; it does not release capacity or begin onboarding.
- Acceptance records the student's agreement but does not start onboarding. The production manager explicitly releases accepted offers, including a partial group if needed.
- Show accepted/total offers with a progress bar, pending discussion and decline counts, and a reviewable release action. Withdrawn/superseded offers are excluded from the active-offer denominator; declines remain visible.
- Prepare offers as drafts, preview them, then send reviewed offers in bulk or individually. Building the cast must not send email implicitly.
- Each offer contains offered role(s), optional understudy or swing designation, covered roles, additional duties, and actor-visible notes. No separate vocal-part or ensemble-designation field is needed.
- Multiple people can accept Ensemble independently. This production initially offers nine Ensemble places. Later assignments may develop into several roles per actor.
- Cast agreement starts with the current Dolly West's Kitchen content and includes attendance requirements: three unexcused absences may result in removal; an unexcused late arrival counts as an absence.
- All students must register for 0–3 credits. Capture their anticipated choice only; Krysta will present the credit options and help students complete official registration. This form does not register them.
- Disclosing rehearsal conflicts does not prevent acceptance. Require an explicit acknowledgement of availability for all performances; inability to meet that requirement must be flagged for discussion before release, not silently treated as full availability.
- Collect unavailable periods plus optional preferences. Flexible rehearsal windows are configurable per project for any weekday, multiple weekdays, individual dates, or no days. Each rule has an enabled switch, applicable date range or specific date, earliest start, latest end, maximum rehearsal duration, and an optional-preferences switch. Rent's initial rule is Sunday, 10 AM–6 PM, with at most four hours of rehearsal; this is project configuration, not a global Sunday assumption. Date-specific exceptions override recurring rules. Fixed rehearsals remain available alongside flexible windows. Disabling a rule stops new availability requests without deleting historical responses or signed schedule snapshots.
- Do not create rehearsal Google Calendar invitations in this release. Store schedule dates, timezone, windows, duration, and participant scope in a way that supports a later calendar module.
- Production managers, directors, stage managers, and assistant stage managers can receive conflict access, with project-specific switches. Role membership alone must not expose sensitive explanations.
- Mike is the initial administrator notification recipient. Support selecting additional recipients later without changing the notification architecture.
- Every application email will use `Siena Theatre Production Management <mlounello@siena.edu>` through the connected Siena Gmail account. Calendar-generated notices remain controlled by the calendar integration.

## Participant wording

Credit question: “How many credits do you currently expect to register for?”

Help text: “All students must register for this production for 0–3 credits. This is your anticipated choice, not official registration. Krysta will give a credit presentation and help you select and officially register for the appropriate number of credits.”

Options: 0 credits, 1 credit, 2 credits, 3 credits, Not sure yet — I would like guidance.

Ensemble offer notes for this production:

> We want you in the company! We want to provide everyone with work that interests them, gives them room to develop a character, and fits them vocally. The score gives us opportunities to divide songs and solos among the company. Your initial offer is for Ensemble; specific characters and assignments will develop as we work together. Listen to the show and start thinking about the roles you would enjoy exploring and developing.

## State and reliability requirements

Keep offer response and assignment activation separate. A student may have an accepted agreement while their assignment remains offered and awaiting production-manager release.

1. Draft: editable internal casting decision; no outbound message or downstream onboarding.
2. Sent/opened: active offer and its exact agreement revision are preserved.
3. Discussion requested: visible follow-up; still pending.
4. Accepted: signature, acknowledgements, anticipated credits, conflicts, and agreement revision recorded; awaiting release.
5. Declined/withdrawn: no onboarding; capacity handled consistently with current assignment rules.
6. Released: manager, time, offer revision, and selected assignments recorded; existing onboarding begins once.
7. Attention: acceptance and release evidence remain saved when a provider fails; failed downstream work is visible and retryable independently.

Changing material role or agreement terms after sending creates a new revision requiring fresh acceptance. Preserve prior responses and do not overwrite signed evidence. Cosmetic changes and later development of Ensemble duties need an explicit distinction from material changes; default material role changes to renewed agreement.

Release preview lists only accepted, current, unreleased offers and shows unresolved mandatory-performance conflicts. Repeated clicks, concurrent requests, and retries must not duplicate assignments or welcome emails. Release must not depend on achieving 100% acceptance.

Audit every path that can currently start onboarding, sync Playbill, prepare publicity, or send reminders. The release gate must apply to individual assignment, bulk assignment, audition casting, background sync, and manual welcome actions as appropriate. Existing accepted/released participants must continue operating normally; activate the new workflow explicitly for the project instead of retroactively reclassifying them.

## Phases

### 1. Casting workspace and release foundation

Add a compact Casting & Offers list with a details drawer, role selection, multi-person capacity, per-offer notes and duties, understudy/swing options, draft preparation, acceptance progress, and explicit release control. Reuse project roles and people. Add version and release metadata using additive migrations. Include preview and recipient review before bulk sends.

### 2. Public acceptance

Extend the secure public agreement with the new response choices, anticipated-credit wording, role-specific details, separate required acknowledgements, and typed-name attestation. Validate required sections and permitted values from the stored agreement on the server, not hidden browser inputs. Provide clear saved/pending-release confirmation and a readable agreement receipt. Preserve existing secure links and compatibility for legacy requests.

### 3. Schedules and conflicts

Keep existing written project schedules available while adding structured fixed events, recurrence date ranges, exclusions, and flexible windows. Provide an enable/disable control per flexible rule, weekday or specific-date selection, window start/end, maximum rehearsal duration, and optional preference collection. Support zero, one, or multiple flexible days, with differing windows and durations. Validate that duration fits within its planning window and resolve date-specific exceptions before displaying availability requests. Present a compact weekly agenda with recurring and one-time conflicts, partial availability, and optional preferences. Show applicants only applicable enabled rules; do not show an empty flexible-availability section when none are enabled. Let staff compare availability for candidate rehearsal calls within each configured window. Export conflicts by rehearsal and by person. Record staff access and later conflict changes. Verify multiple flexible days, no flexible days, date-specific overrides, and preservation of historical responses when rules are disabled. This phase does not reactivate the paused Gantt, timeline, or general calendar workspaces.

### 4. Administrator notifications

Persist acceptance, decline, discussion, release, and failure events for the Overview hub independently of email delivery. Initially notify Mike; make recipients configurable per project. Include actionable links and visible failed notification delivery. Acceptance notifications must survive downstream onboarding/provider errors. Record who has reviewed an item.

### 5. Siena Gmail for all app mail

Adapt the Events application's OAuth Gmail transport with a Production Management connection and protected credentials. Do not read or copy Events refresh tokens into this app. Reuse the implementation pattern, then connect the approved account through OAuth. Preserve HTML branding, templates, recipient rules, and plain-text alternatives. Inventory direct provider calls as well as shared send helpers so profile links, verification codes, offers, welcome messages, campaigns, reminders, and admin notifications all use Gmail.

Use persistent send jobs, bounded pacing, quota-aware retries, and visible failure states. Account for ambiguous send outcomes: Gmail does not provide the same idempotency behavior as the current Resend adapter, so uncertain sends must not be blindly retried. Retain provider message identifiers. No silent provider fallback. Add a fixed-recipient test and show sender/connection readiness before offers can be released for sending.

Gmail can be developed before phase 3 is complete because it is required for tomorrow's real offers. The sequence describes functional increments, not a requirement to delay email verification until all conflict tools are finished.

### 6. Full lifecycle verification and activation

Use isolated test records and explicitly selected test recipients. Verify draft creation sends nothing; batch selection is accurate; links work without an account; required terms cannot be bypassed; discussion and decline do not start onboarding; acceptance awaits release; partial release works; nine Ensemble assignments remain independent; repeated release is safe; publicity and Playbill activate only at the intended point; the existing Google Group welcome gate remains effective; provider errors preserve responses and create visible follow-up.

Verify expired and superseded offers, amended roles, concurrent capacity claims, mobile forms, conflict permissions, notifications to the configured administrator, and calendar/timezone handling. Check live audition routes and existing profile/publicity routes for regressions. Review the final real email and acceptance packet before sending actual cast offers.

## Current implementation areas

- `lib/role-acceptance.ts`: snapshots, sending, and immediate post-acceptance onboarding currently live here; split acceptance from release.
- `app/role-acceptance/[token]/`: existing public response surface and server action.
- `app/projects/[projectId]/onboarding/`: current agreement and schedule settings; retain saved content and connect to Casting.
- `app/projects/[projectId]/actions.ts` and `auditions/actions.ts`: assignment and casting entry points that currently initiate onboarding.
- `lib/project-admin-notifications.ts`: current recipients inferred from memberships; extend with explicit project recipients and durable notification evidence.
- `components/project-workspace-page.tsx`: current Overview notification/activity display.
- `lib/outbound-email.ts`: current shared Resend sender; replace active transport with Google after verification.
- `supabase/migrations/202609150100_multi_person_roles.sql`: existing independent assignment capacity enforcement to preserve.
- Events reference: `/Users/mikelounello/Documents/events-management/lib/integrations/siena-gmail.ts` and `google-gmail.ts`.

## Remaining operational inputs

Existing project content can seed the agreements, and the confirmed decisions above are sufficient to begin phase 1. Before live sending, verify the actual cast/role list, offer response deadline, final rehearsal date range and exclusions, production-manager notification address, and Google account connection. Do not invent these values or send real offers as a side effect of development.
