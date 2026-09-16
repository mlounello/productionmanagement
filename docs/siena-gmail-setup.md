# Siena Gmail delivery and safe rollout

The owner-only **Email Delivery page** at `/settings/email-delivery` connects Siena Gmail, checks authorization, sends a controlled test, displays the durable delivery queue, and can process messages that are ready to retry. Actor records, assignments, existing templates, and existing emails are unchanged.

The Gmail sender is **Siena Theatre Production Management <mlounello@siena.edu>**. Casting offers and their administrator notifications use the Gmail queue after the rollout migration is applied. Keep Resend configured while the remaining application email types are tested; `OUTBOUND_EMAIL_PROVIDER=resend` leaves those existing messages on Resend until the deliberate production-wide cutover.

## 1. Google Cloud setup

1. Sign into [Google Cloud Console](https://console.cloud.google.com/) with the account that manages your Events app's Google project, or create a separate project for Production Management.
2. Select the intended project in the top project selector. Do not delete or change the Events app's existing redirect addresses.
3. Open **APIs & Services → Library**. Find **Gmail API** and enable it in this project.
4. Open **Google Auth Platform** (older Console layouts call this **OAuth consent screen**). Configure the app name and support contact if they have not already been configured.
5. Configure the audience according to the Google Cloud project's organization. If **Internal** is available and this is a Siena-owned project, that may be appropriate. Otherwise use **External** and add `mlounello@siena.edu` as a test user while testing. External apps left in Testing can have expiring authorizations; review Google's publishing requirements before relying on unattended mail.
6. In **Data Access**, request `openid`, the email identity scope, and `https://www.googleapis.com/auth/gmail.send`. This app does not request inbox reading, Google Groups administration, or domain-wide delegation. Siena may still require an administrator to approve the OAuth application.
7. In **Clients / Credentials**, create an **OAuth client ID** of type **Web application**, named Production Management. A separate client keeps its credentials independent of Events.
8. Add this **Authorized redirect URI**, exactly:

   `https://productionmanagement.mlounello.com/api/integrations/gmail/callback`

9. Save. Keep the **Client ID** and **Client secret** private. Put them directly into Vercel; do not paste them in chat or commit them to the repository.

## 2. Server configuration

In the Production Management Vercel project's environment settings, add:

- `PM_GMAIL_CLIENT_ID`: the new Google Client ID.
- `PM_GMAIL_CLIENT_SECRET`: the Google Client secret.
- `PM_GMAIL_ENCRYPTION_KEY`: a newly generated random secret at least 32 characters long, stored in your password manager. This protects the saved refresh token. Do not reuse or copy the Events token. Changing this key requires reconnecting Google.
- `PM_GMAIL_MAX_MESSAGES_PER_24_HOURS`: the application safety cap; `500` is the recommended starting value.
- `PM_ADMIN_NOTIFICATION_EMAIL`: the initial administrator notification recipient; use `mlounello@siena.edu` until configurable recipients are enabled for a project.
- `OUTBOUND_EMAIL_PROVIDER`: keep this as `resend` during casting rollout. Change it to `gmail` only after the complete lifecycle test approves moving every existing application email onto Gmail.
- Verify `NEXT_PUBLIC_SITE_URL` is exactly `https://productionmanagement.mlounello.com`.

These three `PM_GMAIL_*` secrets must **not** use a `NEXT_PUBLIC_` prefix. Only configure Production initially; avoid giving untrusted preview deployments production mail credentials. Redeploy after changing environment variables.

Apply both additive migrations to the correct Production Management database in this order:

1. `202609160300_gmail_connection.sql` stores the encrypted Gmail connection and controlled-test log.
2. `202609160400_gmail_delivery_and_notifications.sql` adds the durable outbound queue, casting delivery status, capacity reservation, and project notifications.

Neither migration updates or deletes actor records. Ordinary authenticated and anonymous clients receive no access to Gmail credentials or queued message bodies.

## 3. Connect your account

1. Sign into Production Management as its **owner**.
2. Open **Email Templates → Email delivery setup**, or visit `/settings/email-delivery`.
3. Click **Connect Siena Gmail**.
4. Choose `mlounello@siena.edu` and approve the requested permission to send mail. Connecting another account is rejected.
5. You return to Email Delivery with a connected confirmation. No email has been sent and live delivery has not changed.
6. Click **Check authorization (no email)**. This checks the refresh credential and verified account identity. It is not a delivery test.

## 4. Send the controlled test

1. Confirm you intentionally want one test email sent to yourself. Outbound sending must be enabled (`DISABLE_OUTBOUND_EMAIL=false`); the test respects the existing global email-off switch. Do not change that global switch casually if it is deliberately holding other workflows.
2. Click **Send one test to mlounello@siena.edu**. There is no editable recipient field.
3. Check your Siena inbox and Sent folder. Confirm the sender display name, Siena formatting, and readable body.
4. Check the **Recent connection tests** log for a sent receipt. Gmail accepting a request is not a guarantee that it reached the inbox.
5. If the result is **uncertain** or remains **pending**, inspect Sent before starting another test. Network interruptions can happen after Google sends the message. The application deliberately does not retry ambiguous tests automatically. Repeated submission of the same test request cannot send again.

## 5. Casting rollout

1. Leave `ENABLE_CASTING_RELEASE=false` while offers and public responses are tested. Sending an offer does not occupy the role or start onboarding.
2. Prepare offers on the project's Casting page. Review the exact email preview, select the intended people, acknowledge the confirmation, and send.
3. The application reserves available role capacity before queuing each offer, preventing more active offers than a single-occupancy role can hold.
4. Every offer is stored before Gmail is called. Sent, failed, and uncertain results remain visible on the casting tracker and Email Delivery page.
5. Accepted, declined, and discussion-requested responses create a persistent project notification and send an administrator email.
6. Rate-limited work remains queued. Use **Process ready queue now** on Email Delivery after its retry time. The existing daily maintenance job also performs a safety retry. Ambiguous deliveries are marked **uncertain** and are never blindly resent.
7. Only after a complete test should `ENABLE_CASTING_RELEASE` be enabled and the reviewed accepted cohort be released into assignments/onboarding.

## Troubleshooting

- **Owner required:** your application role must be `owner`, not merely a project manager.
- **Redirect URI mismatch:** the saved Google redirect must match the exact URI above and the application's site URL.
- **Access blocked:** Siena's Google administrator may need to approve this OAuth client; domain-wide delegation is not required by this design.
- **Storage unavailable:** apply the Gmail migration to the application's database/schema.
- **Could not unlock connection:** restore the correct encryption key or reconnect the account.
- **Expired authorization:** reconnect. Password/security changes, revoked consent, and testing-mode restrictions may invalidate authorization.
- **Sending limits or permissions:** a failed test is recorded, not silently sent through Resend. Review Google's response status and account policy before retrying.

Google references: [Web-server OAuth and offline access](https://developers.google.com/identity/protocols/oauth2/web-server), [OAuth security best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices), [Gmail sending](https://developers.google.com/workspace/gmail/api/guides/sending).
