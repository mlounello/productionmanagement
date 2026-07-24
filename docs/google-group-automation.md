# Google Group automation setup guide

## Current Siena approach: Apps Script membership reconciliation

Siena does not permit the service-account/domain-wide-delegation approach, and the available group-manager account cannot use the Admin SDK. Production Management therefore uses this supported workflow:

1. Create and manage each Google Group manually.
2. Deploy a small read-only Google Apps Script as a Siena group manager.
3. Production Management asks that script whether each assigned email is a direct member.
4. The app marks people **verified**, **missing**, or **unable to check**.
5. A Google Group manager adds/removes missing people manually and runs the check again.
6. Custom HTML welcome email remains automated through Resend.

The older service-account instructions remain later in this document for reference only. Do not configure them unless Siena changes its policy.

## Apps Script setup from the beginning

### 1. Create the script

1. Sign into the Siena Google account that successfully ran the `GroupsApp.hasUser()` test.
2. Open [Google Apps Script](https://script.google.com/).
3. Click **New project**.
4. Click the project title near the top-left and rename it `Production Management Group Membership Check`.
5. Open the repository file `integrations/apps-script/google-groups-membership-check.gs`.
6. Copy its complete contents.
7. Return to Apps Script, open `Code.gs`, delete the sample function, and paste the copied code.
8. Click **Save project**.

The script is read-only. It calls `GroupsApp.getGroupByEmail()` and `group.hasUser()`; it does not add, remove, or modify Google Group members.

### 2. Create a shared secret

The shared secret prevents someone who discovers the web-app URL from using it freely.

1. Generate a long random value with a password manager. Use at least 32 random characters.
2. In Apps Script, click **Project Settings** (the gear icon).
3. Scroll to **Script Properties**.
4. Click **Add script property**.
5. Enter `SHARED_SECRET` as the property name.
6. Paste the random value as its value.
7. Save the property.
8. Store the same value in an approved password manager. Do not put it in the source code or Git.

### 3. Authorize the script

1. Add this temporary test function at the bottom of `Code.gs`:

   ```javascript
   function authorizeGroupsAccess() {
     const group = GroupsApp.getGroupByEmail('replace-with-a-group@siena.edu');
     console.log(group.getEmail());
   }
   ```

2. Replace the sample address with a group you manage.
3. Save.
4. Select `authorizeGroupsAccess` in the function menu.
5. Click **Run**.
6. Review Google's permission prompt and authorize the script using the Siena account.
7. Confirm the execution log shows the group email.
8. Delete the temporary `authorizeGroupsAccess` function and save again.

### 4. Deploy as a web app

1. Click **Deploy → New deployment**.
2. Click the gear beside **Select type** and choose **Web app**.
3. Enter a description such as `Production membership check v1`.
4. For **Execute as**, choose **Me**. This makes every check use the group-level permissions you already confirmed.
5. For **Who has access**, select the broadest option Siena permits that allows the Production Management server to call it. Depending on Siena policy, this may appear as **Anyone**.
6. Click **Deploy**.
7. Approve authorization if Google asks again.
8. Copy the **Web app URL**. Use the deployed URL ending in `/exec`, not the development URL ending in `/dev`.

If Siena does not permit a web app callable by the Production Management server, this bridge cannot be used without IT assistance. The request body includes the shared secret, and Production Management validates that the URL is hosted on Google's Apps Script domains.

### 5. Configure Vercel

In the Production Management Vercel project, open **Settings → Environment Variables** and add:

- `GOOGLE_GROUPS_APPS_SCRIPT_URL`
  - Paste the deployed `/exec` URL.
- `GOOGLE_GROUPS_APPS_SCRIPT_SHARED_SECRET`
  - Paste the exact `SHARED_SECRET` value from Apps Script.
- `ENABLE_GOOGLE_GROUP_MEMBERSHIP_CHECK=true`

Keep these older flags off:

- `ENABLE_GOOGLE_GROUP_SYNC=false`
- `ENABLE_GOOGLE_GROUP_AUTO_CREATE=false`

Redeploy Production Management after saving the variables.

### 6. Apply the reconciliation migration

Apply:

`supabase/migrations/202607131300_google_group_membership_reconciliation.sql`

This adds the last-checked timestamp and new audit action types. It does not contact Google, change assignments, send email, or modify Google membership.

### 7. Connect and test a role group

1. Open a test project in Production Management.
2. Open **Google Groups**.
3. Choose **Manual existing group** for a role group.
4. Paste the actual Google Group email.
5. Turn on **Check assigned people against Google membership**.
6. If desired, turn on **Flag manual Google removal when unassigned**.
7. Save.
8. Click **Test Google Group Connection**.
9. Click **Check all memberships**.
10. Confirm known internal and external members show **verified**.
11. Confirm a deliberately absent test address shows **missing**.
12. Copy the missing-address list, add those people in Google Groups, and click **Check all memberships** again.

When a new role assignment is created, Production Management automatically runs the same read-only check. A missing membership produces a visible warning but never blocks the assignment.

### Group checks, whole-project checks, and communication skips

- **Check memberships for this group only** checks assignments whose roles belong to that specific role group.
- **Check memberships for all groups** at the top of the page checks the entire project.
- Membership-check buttons never send welcome emails. Welcome delivery occurs during a new assignment or through the explicit resend action.
- **Skip communications** applies to one role assignment. It bypasses Google membership checks, Propared/welcome email, and manual Google-removal reminders for that assignment.
- If the same person has another assignment, that other assignment keeps its own independent communication setting.
- **Restore communications** re-enables the assignment but does not immediately send anything; run a membership check or use the appropriate welcome action when ready.

Apply this migration before using assignment communication skips:

`supabase/migrations/202607131500_assignment_communication_skips.sql`

### Add the role group's Propared link

Each role group has a **Propared Production Book link** field on the Google Groups page.

1. Paste the Propared URL intended for that role group.
2. Save the manual group connection.
3. Use `{{propared_rolegroup_link}}` anywhere in the welcome subject or HTML body.
4. Use `{{profile_access_url}}` for the person’s private Production Management profile link. If an older template does not include it, the app automatically appends profile, headshot, and show-bio instructions after the agreement is accepted.

The same template can be selected for multiple role groups. At delivery time, Production Management substitutes the Propared link stored on the recipient's role group.

### Send a welcome-email test safely

1. Select and save the welcome template for the role group.
2. Save the Propared link.
3. Expand **Send a safe test email**.
4. Enter one test recipient address, plus the sample person and role names you want to preview.
5. Click **Send test to this address only**.

The test subject is prefixed with `[TEST]`, and the email contains a visible test banner. It is sent only to the exact test address entered. It does not send to the Google Group, assign a person, create a welcome-delivery record, or prevent the real recipient from later receiving their welcome.

Apply this migration before using the Propared field or test-email action:

`supabase/migrations/202607131400_propared_role_group_links_and_email_tests.sql`

### 8. Updating the Apps Script later

Editing and saving `Code.gs` does not automatically update the deployed `/exec` version.

1. Make and save the script change.
2. Click **Deploy → Manage deployments**.
3. Open the existing web-app deployment for editing.
4. Choose **New version**.
5. Add a description and deploy.
6. The existing `/exec` URL normally remains the same.
7. Retest the group connection from Production Management.

If you create a completely new deployment and its URL changes, update `GOOGLE_GROUPS_APPS_SCRIPT_URL` in Vercel and redeploy Production Management.

### 9. Apps Script troubleshooting

- **Unauthorized:** the Apps Script `SHARED_SECRET` and Vercel secret differ.
- **Membership checking is disabled:** `ENABLE_GOOGLE_GROUP_MEMBERSHIP_CHECK` is missing/false or the app was not redeployed.
- **Apps Script URL is invalid:** use the deployed Google `/exec` URL.
- **You do not have permission to view the group's member list:** the account that deployed the script cannot view that specific group. Add it as a group manager/owner or deploy from the correct account.
- **A member appears missing:** the check is for direct membership. Nested-group membership is not treated as direct membership.
- **External member appears missing unexpectedly:** verify the exact email in Google Groups, including aliases, and run the simple `hasUser()` test for that address in Apps Script.
- **Changes are not reflected:** Google may take a short time to reflect membership changes; wait briefly and check again.
- **The script works in the editor but not from Production Management:** confirm the web app executes as **Me**, the `/exec` deployment is current, and its access setting permits server calls.

---

## Legacy service-account reference

This guide assumes you have never created a Google Cloud service account before. Production Management uses the **manual group connection model**: an administrator creates each Google Group in Google, then pastes its actual email into Production Management. The service-account path below is currently unavailable at Siena and is retained only in case policy changes.

## What you are setting up

The Production Management app needs a secure, non-human Google identity called a **service account**. The service account asks Google to act as a designated Siena administrator. Google calls this **domain-wide delegation**.

There are three distinct pieces:

1. **Google Cloud project:** contains the enabled Google APIs and service account.
2. **Google Workspace Admin configuration:** authorizes exactly which API permissions the service account may request.
3. **Production Management environment variables:** give the app the service-account email, private key, and Siena administrator it should impersonate.

The app uses:

- **Admin SDK Directory API** to find groups and add/remove members. Group creation is performed manually in Google Admin.
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
  - Produces `rent-stage-crew-group@siena.edu`.
  - Use an empty value if Siena confirms that the suffix is unnecessary.

Google's Directory API expects the complete group email supplied by the app; the app does not rely on Google to append `-group`.

### External-access defaults

Start conservatively:

- `GOOGLE_GROUP_DEFAULT_EXTERNAL_MEMBER_SUPPORT=false`
- `GOOGLE_GROUP_DEFAULT_EXTERNAL_POSTING_SUPPORT=false`

Change either to `true` only after Siena IT confirms that the domain policy permits it and approves the production workflow. Even when the app requests external access, a stricter Siena domain policy can override or reject the request.

### Feature flags

Automatic group creation is not part of the active Siena workflow:

- `ENABLE_GOOGLE_GROUP_SYNC=false`
- `ENABLE_GOOGLE_GROUP_AUTO_CREATE=false` — leave this false.

After changing Vercel variables, redeploy the current Production deployment so the running application receives the new values.

## Part 9: Configure HTML welcome email delivery

Welcome emails are separate from Google Group membership messages.

1. In Resend, create or select the sending domain used by Production Management.
2. Complete Resend's DNS verification for that domain.
3. Create a restricted API key for this application.
4. Add the key to Vercel as `RESEND_API_KEY`.
5. Verify `mlounello.com` in Resend. Production Management enforces the sender `Production Management <production-management@mlounello.com>` for every workflow.
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

## Part 14: Repeat the manual connection for each role group

For every production role group that needs email communication:

1. Review the suggested address in Production Management.
2. Create the group manually in Google Admin using that address when available.
3. Configure membership, posting, external access, moderation, and spam controls in Google Admin according to Siena policy.
4. Copy the actual group email Google displays after creation. Do not assume it exactly matches the suggestion.
5. In Production Management, choose **Manual existing group**.
6. Paste the actual group email.
7. Enable membership synchronization and the welcome email options desired for that role group.
8. Save and click **Test Google Group Connection**.

Leave `ENABLE_GOOGLE_GROUP_AUTO_CREATE=false`. All membership synchronization, unassignment handling, welcome emails, retry actions, and audit logging use the manually entered active address.

## Architecture and data behavior

Each distinct `project_roles.role_group` value can have one `project_role_group_google_settings` row.

- `proposed_google_group_email` is the address generated by the app.
- `active_google_group_email` is the address actually used for API operations.
- `google_group_mode` records whether the role group uses auto, manual, or disabled mode.

Assignment creation remains authoritative. Google or email failures are recorded on the assignment and in `google_group_action_log`, but do not roll back the assignment.

## Troubleshooting

### “Automatic Google Group creation is disabled”

This is expected because Siena is using manual group creation. Leave `ENABLE_GOOGLE_GROUP_AUTO_CREATE=false`, create the group in Google Admin, and connect it using Manual existing group.

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
- Connect multiple manually created disposable groups.
- Confirm a permission failure leaves the project assignment intact and writes an audit entry.
- Confirm each role group uses its manually entered active address.
- Review external access, posting, moderation, and spam settings in Google Admin.

Use designated test projects, groups, and addresses. Do not run acceptance tests against active production groups until Siena approves the API configuration.

## Official references

- [Create Google Workspace access credentials](https://developers.google.com/workspace/guides/create-credentials)
- [Domain-wide delegation administration](https://knowledge.workspace.google.com/admin/apps/control-api-access-with-domain-wide-delegation)
- [OAuth 2.0 for service accounts](https://developers.google.com/identity/protocols/oauth2/service-account)
- [Admin SDK Directory API groups](https://developers.google.com/workspace/admin/directory/reference/rest/v1/groups)
- [Admin SDK Directory API members](https://developers.google.com/workspace/admin/directory/reference/rest/v1/members)
- [Groups Settings API](https://developers.google.com/workspace/admin/groups-settings/v1/reference/groups)
