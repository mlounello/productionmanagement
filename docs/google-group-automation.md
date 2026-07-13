# Google Group automation setup guide

This guide assumes you have never created a Google Cloud service account before. Complete the sections in order. Nothing in Google will begin creating groups or changing memberships merely because you create the account; those actions begin only after the app is configured and its feature flags are enabled.

## What you are setting up

The Production Management app needs a secure, non-human Google identity called a **service account**. The service account asks Google to act as a designated Siena administrator. Google calls this **domain-wide delegation**.

There are three distinct pieces:

1. **Google Cloud project:** contains the enabled Google APIs and service account.
2. **Google Workspace Admin configuration:** authorizes exactly which API permissions the service account may request.
3. **Production Management environment variables:** give the app the service-account email, private key, and Siena administrator it should impersonate.

The app uses:

- **Admin SDK Directory API** to find/create groups and add/remove members.
- **Groups Settings API** to configure external membership, posting, moderation, and spam settings.
- **Resend**, not Gmail, to send the separate custom HTML welcome message.

## Before you begin

You will need:

- A Google account allowed to create or manage a Google Cloud project.
- Help from a Siena Google Workspace **Super Admin**. Only a Super Admin can approve domain-wide delegation. If that is not you, the guide identifies exactly what to send them.
- A Siena account that the app can impersonate for group administration. A dedicated account such as `production-automation@siena.edu` is ideal. A normal personal account is not recommended.
- Access to the Production Management project in Vercel.
- Access to the Resend account used by Production Management.

Decide who will own the Google Cloud project before continuing. Use an institution-controlled project and ownership group where possible so the integration does not depend on one employee's personal account.

## Part 1: Create or select a Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Sign in with the account Siena wants to own this integration.
3. Click the project selector at the top of the page.
4. Either select an existing institution-controlled project or click **New Project**.
5. If creating one, enter a clear name such as `Siena Production Management`.
6. Select Siena's organization and billing location if Google asks. These APIs normally do not require paid usage at this scale, but the organization controls which options appear.
7. Click **Create**.
8. Wait for creation to finish, then use the project selector to make sure the new project is selected.

Always verify the selected project before creating credentials. Creating the service account in the wrong Cloud project is a common source of confusion.

## Part 2: Enable the required Google APIs

Repeat these steps for both required APIs:

1. In Google Cloud Console, open **APIs & Services → Library**.
2. Search for **Admin SDK API**.
3. Open the result and click **Enable**.
4. Return to the API Library.
5. Search for **Groups Settings API**.
6. Open the result and click **Enable**.
7. Open **APIs & Services → Enabled APIs & services** and confirm both names appear.

You do not need to enable the Gmail API for this feature because welcome messages are sent through Resend.

## Part 3: Create the service account

1. In Google Cloud Console, open **IAM & Admin → Service Accounts**.
2. Confirm the correct Cloud project is shown at the top.
3. Click **Create service account**.
4. Enter a name such as `Production Management Google Groups`.
5. Accept or edit the generated service account ID. A suitable ID is `production-management-groups`.
6. Add a description such as `Manages project Google Groups and memberships for the Production Management app.`
7. Click **Create and continue**.
8. Google may offer to grant Cloud IAM roles. This integration does not need broad Cloud roles such as Owner or Editor. Leave the role blank unless Siena's Cloud administrators require a specific internal policy.
9. Click **Continue**, then **Done**.
10. Copy the service account's email address. It will resemble:

   `production-management-groups@your-cloud-project.iam.gserviceaccount.com`

This value will later become `GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL`.

Cloud IAM roles and Google Workspace administrator privileges are separate. Giving the service account a Cloud role does not, by itself, let it manage Siena Google Groups.

## Part 4: Enable and record domain-wide delegation

1. On **IAM & Admin → Service Accounts**, click the service account you just created.
2. Open its **Details** page.
3. Expand **Advanced settings** or locate **Domain-wide delegation**. Google occasionally changes the page layout.
4. If the page offers an **Enable Google Workspace Domain-wide Delegation** option, enable it and save. Enter a product name such as `Siena Production Management` if requested.
5. Find the service account's numeric **Client ID** under Domain-wide delegation.
6. Copy the Client ID and save it temporarily. It is usually a long number.

The numeric Client ID is used only in Google Admin to authorize delegation. It is **not** the service account email and it is not one of the Production Management environment variables.

If no Client ID is visible, confirm that domain-wide delegation was enabled and refresh the page. Siena's Google Cloud organization policy may require a Cloud administrator to allow it.

## Part 5: Choose the delegated Siena administrator

The app must impersonate a real Siena Workspace account when calling the Admin APIs. This is the value for `GOOGLE_WORKSPACE_ADMIN_EMAIL`.

Recommended approach:

1. Ask Siena IT to create or designate a dedicated account such as `production-automation@siena.edu`.
2. Give that account only the Google Workspace privileges required to manage Groups.
3. Do not use a Super Admin as the everyday delegated account.
4. Do not use an employee's account if it may later be suspended or deleted.

Siena IT can use Google's predefined **Groups Admin** role or create a narrower custom admin role that permits group creation, group reading, membership management, and group settings management. The exact privilege names visible in Google Admin can vary with the Workspace edition and Google's current interface.

The delegated account should be tested manually in Google Admin: it should be able to create a test group, add and remove a member, and edit the group settings needed by the production workflow.

## Part 6: Authorize domain-wide delegation in Google Admin

This section must be completed by a Siena Google Workspace Super Admin.

1. Open [Google Admin Console](https://admin.google.com/).
2. Sign in as a Super Admin for `siena.edu`.
3. Open **Security → Access and data control → API controls**.
4. Find **Domain-wide delegation** and click **Manage Domain Wide Delegation**.
5. Click **Add new**.
6. In **Client ID**, paste the numeric service-account Client ID copied in Part 4.
7. In **OAuth scopes**, paste this comma-separated value on one line:

   `https://www.googleapis.com/auth/admin.directory.group,https://www.googleapis.com/auth/admin.directory.group.member,https://www.googleapis.com/auth/apps.groups.settings`

8. Click **Authorize**.
9. Confirm that the new client appears with all three scopes.

Google notes that delegation changes can take up to 24 hours, although they usually take effect sooner. Do not repeatedly create new credentials while waiting.

### Message to send Siena IT

If you are not a Super Admin, send IT:

- Purpose: Production Management project Google Group automation.
- Service account email from Part 3.
- Numeric OAuth Client ID from Part 4.
- The exact three comma-separated scopes above.
- The Siena account chosen for `GOOGLE_WORKSPACE_ADMIN_EMAIL`.
- A request to assign that Siena account an appropriate Groups Admin or custom group-management role.
- A request to confirm whether Siena permits external group members and external posting.

Domain-wide delegation authorizes the service account to request the listed scopes. The impersonated Siena account's administrator privileges and Siena's organization policies still control whether a specific operation succeeds.

## Part 7: Create a JSON private key

Treat this key like a password. Anyone with it may attempt to authenticate as the service account.

1. Return to Google Cloud Console.
2. Open **IAM & Admin → Service Accounts**.
3. Click the service account.
4. Open the **Keys** tab.
5. Click **Add key → Create new key**.
6. Choose **JSON**.
7. Click **Create**. A JSON file downloads once.
8. Store it temporarily in a secure location. Do not email it, put it in shared chat, commit it to Git, or copy it into the project folder.

Open the JSON file in a plain-text editor. You need only these fields:

- `client_email` → `GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL`
- `private_key` → `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

The private key begins with `-----BEGIN PRIVATE KEY-----` and ends with `-----END PRIVATE KEY-----`.

After Vercel is configured and tested, place the downloaded JSON file in an approved password/secret manager or delete the local copy according to Siena policy. If the file is exposed, delete that key in Google Cloud immediately, create a replacement, and update Vercel.

If Siena blocks downloadable service-account keys through organization policy, stop here and contact Siena's Cloud administrator. Do not weaken the policy or invent an alternate credential flow without a security review.

## Part 8: Configure Production Management in Vercel

1. Open [Vercel](https://vercel.com/) and select the Production Management project.
2. Open **Settings → Environment Variables**.
3. Add each variable below. Select **Production**, and also **Preview** only if you intend to test this against a separate safe Google setup.

### Google identity variables

- `GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL`
  - Value: the JSON file's `client_email` value.
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
  - Value: the complete JSON file's `private_key` value, including the BEGIN/END lines.
  - Vercel supports multiline secret values. Paste the real line breaks. The app also accepts a value containing literal `\n` sequences if necessary.
- `GOOGLE_WORKSPACE_ADMIN_EMAIL`
  - Value: the dedicated Siena administrator selected in Part 5, such as `production-automation@siena.edu`.

Never use the JSON `private_key_id`, numeric delegation Client ID, or Cloud project ID in place of these values.

### Group address variables

- `GOOGLE_GROUP_DOMAIN=siena.edu`
- `GOOGLE_GROUP_EMAIL_SUFFIX=-group`
  - Produces `rent-production-stage-crew-group@siena.edu`.
  - Use an empty value if Siena confirms that the suffix is unnecessary.

Google's Directory API expects the complete group email supplied by the app; the app does not rely on Google to append `-group`.

### External-access defaults

Start conservatively:

- `GOOGLE_GROUP_DEFAULT_EXTERNAL_MEMBER_SUPPORT=false`
- `GOOGLE_GROUP_DEFAULT_EXTERNAL_POSTING_SUPPORT=false`

Change either to `true` only after Siena IT confirms that the domain policy permits it and approves the production workflow. Even when the app requests external access, a stricter Siena domain policy can override or reject the request.

### Feature flags

For the first deployment, keep both off:

- `ENABLE_GOOGLE_GROUP_SYNC=false`
- `ENABLE_GOOGLE_GROUP_AUTO_CREATE=false`

After changing Vercel variables, redeploy the current Production deployment so the running application receives the new values.

## Part 9: Configure HTML welcome email delivery

Welcome emails are separate from Google Group membership messages.

1. In Resend, create or select the sending domain used by Production Management.
2. Complete Resend's DNS verification for that domain.
3. Create a restricted API key for this application.
4. Add the key to Vercel as `RESEND_API_KEY`.
5. Set `EMAIL_FROM` to a verified sender, for example `Production Management <production@siena.edu>` if that address/domain is approved and verified.
6. Initially keep `DISABLE_OUTBOUND_EMAIL=true`.
7. Once a test template and recipient are ready, set `DISABLE_OUTBOUND_EMAIL=false` and redeploy.

The welcome template supports HTML headings, links, lists, bold text, and these variables:

- `{{person_name}}`
- `{{project_title}}`
- `{{role_name}}`
- `{{role_group}}`
- `{{google_group_email}}`

## Part 10: Apply the database migration

The migration file is:

`supabase/migrations/202607122200_google_group_automation.sql`

It creates the settings, audit, and welcome-delivery tables; adds Google/welcome status fields to role assignments; enables row-level security; and grants the app roles explicit table permissions.

Apply it using the project's approved Supabase migration process. A database administrator should review it first. Do not test the Google Groups page against production until the migration has completed successfully.

Applying the migration does not create a Google Group, add a member, or send an email. Those actions still require the feature flags and role-group settings.

## Part 11: First safe test using an existing manual group

Test manual mode before enabling automatic group creation.

1. Ask Siena IT to create a disposable group such as `production-management-api-test-group@siena.edu`.
2. Add one approved internal test account manually if desired.
3. Deploy the app with:
   - `ENABLE_GOOGLE_GROUP_SYNC=false`
   - `ENABLE_GOOGLE_GROUP_AUTO_CREATE=false`
   - `DISABLE_OUTBOUND_EMAIL=true`
4. Open a test project in Production Management.
5. Open **Google Groups**.
6. Expand a role group.
7. Choose **Manual existing group**.
8. Enter the disposable group's complete email in **Active Google Group email**.
9. Save.
10. Click **Test Google Group Sync**. This test reads the group but does not add a member.
11. If the read succeeds, set `ENABLE_GOOGLE_GROUP_SYNC=true` in Vercel and redeploy.
12. Assign an approved internal test person to that role group.
13. Confirm the person remains assigned in Production Management.
14. Confirm the person appears as a group member in Google Admin or Google Groups.
15. Review the action log on the project's Google Groups page.
16. Retry the sync. It should report that the person is already present rather than creating a duplicate.
17. Test unassignment once with **Remove from group when unassigned** off, then once with it on.

If synchronization fails, the production assignment remains saved. Read the visible warning and audit entry before changing credentials.

## Part 12: Test the custom welcome email

1. In the role-group Google settings, create an HTML welcome template.
2. Select the template and enable **Welcome email**.
3. Confirm `RESEND_API_KEY` and `EMAIL_FROM` are configured.
4. Set `DISABLE_OUTBOUND_EMAIL=false` and redeploy.
5. Assign an approved test person with an email address.
6. Confirm exactly one welcome message arrives.
7. Retry Google synchronization. It must not send the original welcome twice.
8. Click **Resend welcome** and confirm one additional message arrives.
9. Verify the audit log distinguishes `welcome_email_sent` from `welcome_email_resent`.

## Part 13: Test external membership safely

Do this only after Siena IT approves external members.

1. Set `GOOGLE_GROUP_DEFAULT_EXTERNAL_MEMBER_SUPPORT=true` if new auto-created groups should accept external members.
2. Keep external posting off for the first membership test.
3. Redeploy.
4. Use a disposable test group and an external address controlled by the test team.
5. Assign that person and review the membership result.
6. If Google rejects the member, capture the app's audit error and ask Siena IT whether external membership is disabled for the domain or organizational unit.
7. Enable `GOOGLE_GROUP_DEFAULT_EXTERNAL_POSTING_SUPPORT=true` only after Siena approves external posting and its moderation implications.

These defaults are applied when the app creates/configures a group. They do not bypass Siena policy.

## Part 14: Enable automatic group creation

Only proceed after manual lookup and membership synchronization work.

1. Confirm `GOOGLE_GROUP_DOMAIN` and `GOOGLE_GROUP_EMAIL_SUFFIX` produce the expected proposed address.
2. Create a disposable project/role group for the test.
3. Set `ENABLE_GOOGLE_GROUP_AUTO_CREATE=true` in Vercel.
4. Redeploy.
5. Open the project's Google Groups page.
6. Select **Auto create** and save.
7. Click **Create Google Group**.
8. Confirm the proposed address becomes the active address.
9. Confirm the group exists in Google Admin.
10. Review its member, posting, external-access, moderation, and spam settings.
11. Assign an internal test person and verify membership.

If the proposed group already exists, the app adopts it instead of attempting a destructive duplicate creation. If creation fails, switch to manual mode and enter an existing group. Both paths use the same active-group field and synchronization system.

## Architecture and data behavior

Each distinct `project_roles.role_group` value can have one `project_role_group_google_settings` row.

- `proposed_google_group_email` is the address generated by the app.
- `active_google_group_email` is the address actually used for API operations.
- `google_group_mode` records whether the role group uses auto, manual, or disabled mode.

Assignment creation remains authoritative. Google or email failures are recorded on the assignment and in `google_group_action_log`, but do not roll back the assignment.

## Troubleshooting

### “Automatic Google Group creation is disabled”

`ENABLE_GOOGLE_GROUP_AUTO_CREATE` is false or missing. This is expected during manual-mode testing.

### “Google Group sync is disabled” or no membership change occurs

Check all three levels:

1. `ENABLE_GOOGLE_GROUP_SYNC=true` in the deployed Vercel environment.
2. The role group is not in Disabled mode and has an active group email.
3. **Google Group sync enabled** is checked for that role group.

Redeploy after changing environment variables.

### `unauthorized_client` or “Client is unauthorized”

The numeric Client ID was not authorized for domain-wide delegation, the scopes do not match exactly, or delegation has not propagated yet. Recheck Part 6. Do not put the service-account email in Google Admin's Client ID field.

### `invalid_grant`

Common causes are an incorrect delegated administrator email, a suspended/deleted delegated account, domain-wide delegation not yet active, or a malformed private key. Confirm `GOOGLE_WORKSPACE_ADMIN_EMAIL` is a real active Siena account and that the private key includes its complete BEGIN/END lines.

### `forbidden`, `notAuthorizedToAccessThisResource`, or insufficient permissions

Authentication succeeded, but the delegated Siena account lacks the necessary Groups privileges or a Siena policy prohibits the operation. Ask Siena IT to review that account's admin role and the domain's Groups policies.

### Group not found

Confirm the complete active group email, including the configured suffix and domain. Manual mode must use the actual Google Group address, not merely its display name.

### External member or posting rejected

The app cannot override Siena Workspace policy. Ask IT to review the domain/organizational-unit Google Groups for Business sharing settings and the specific group's access settings.

### Welcome email fails while group membership succeeds

Google and welcome delivery are intentionally separate. Check `RESEND_API_KEY`, `EMAIL_FROM`, sender-domain verification, `DISABLE_OUTBOUND_EMAIL`, the person's email, and the app audit log.

### The settings page reports a missing table or permission denied

Confirm `202607122200_google_group_automation.sql` was applied to the correct database. The migration contains explicit grants and row-level security policies. Do not manually disable row-level security.

## Credential maintenance

- Store the JSON key only in approved secret storage.
- Never commit credentials or paste them into support tickets.
- Limit access to the Vercel environment variables.
- Review the domain-wide delegation entry and service-account keys periodically.
- Rotate the private key according to Siena policy: create a new key, update Vercel, redeploy/test, then delete the old key.
- Remove domain-wide delegation before retiring the integration.
- Delete unused keys immediately.
- Review `google_group_action_log` for unexpected operations or repeated failures.

## Full acceptance checklist

- Run `npm run test:google-groups`; verify addresses with and without `-group`.
- Read/test a manually entered existing group.
- Add an internal member.
- Add an approved external member.
- Retry a person already in the group.
- Send one HTML welcome email.
- Verify ordinary retry does not duplicate the welcome.
- Manually resend the welcome.
- Remove a member when removal-on-unassign is enabled.
- Leave a member when removal-on-unassign is disabled.
- Create a disposable group automatically.
- Adopt an already-existing proposed group.
- Confirm a permission failure leaves the project assignment intact and writes an audit entry.
- Confirm manual fallback works after auto-create failure.
- Review external access, posting, moderation, and spam settings in Google Admin.

Use designated test projects, groups, and addresses. Do not run acceptance tests against active production groups until Siena approves the API configuration.

## Official references

- [Create Google Workspace access credentials](https://developers.google.com/workspace/guides/create-credentials)
- [Domain-wide delegation administration](https://knowledge.workspace.google.com/admin/apps/control-api-access-with-domain-wide-delegation)
- [OAuth 2.0 for service accounts](https://developers.google.com/identity/protocols/oauth2/service-account)
- [Admin SDK Directory API groups](https://developers.google.com/workspace/admin/directory/reference/rest/v1/groups)
- [Admin SDK Directory API members](https://developers.google.com/workspace/admin/directory/reference/rest/v1/members)
- [Groups Settings API](https://developers.google.com/workspace/admin/groups-settings/v1/reference/groups)
