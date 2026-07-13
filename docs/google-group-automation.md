# Google Group automation

## Architecture

Each distinct `project_roles.role_group` value can have one `project_role_group_google_settings` row. The proposed address is generated from the project slug, `production`, the role-group slug, the configured suffix, and the configured domain. The active address is the only address used for member synchronization, whether it was created automatically or entered manually.

Assignment creation remains authoritative. Google Group and welcome-email failures are recorded on the assignment and in `google_group_action_log`, but never roll back the assignment.

## Google Workspace setup

Enable these APIs in the service account's Google Cloud project:

- Admin SDK API
- Groups Settings API

Create a dedicated service account, enable domain-wide delegation, and authorize its OAuth client in Google Admin with:

- `https://www.googleapis.com/auth/admin.directory.group`
- `https://www.googleapis.com/auth/admin.directory.group.member`
- `https://www.googleapis.com/auth/apps.groups.settings`

Set `GOOGLE_WORKSPACE_ADMIN_EMAIL` to the delegated Siena account. That account must have enough Google Admin privileges to create groups and manage memberships/settings. A Groups Admin or a narrower custom admin role is preferable to a super-admin account.

The Directory API creates groups and manages members. The Groups Settings API controls external membership, posting, web posting, moderation, and spam handling. Siena Workspace policy can still reject an otherwise valid API request; the app records that response and leaves the production assignment intact.

## Environment and rollout

Required configuration is documented in `.env.example`. Keep both feature flags off for the first deployment:

1. Apply the database migration.
2. Configure the domain, suffix, service-account credentials, delegated admin, Resend key, and sender.
3. Enter a test project's Google Group manually and enable `ENABLE_GOOGLE_GROUP_SYNC`.
4. Test membership and welcome delivery with designated internal and external addresses.
5. Enable `ENABLE_GOOGLE_GROUP_AUTO_CREATE` only after Siena confirms programmatic group creation and the default external-access settings.

The suffix is not hard-coded. Use `GOOGLE_GROUP_EMAIL_SUFFIX=-group` for `rent-production-stage-crew-group@siena.edu`, or an empty value for `rent-production-stage-crew@siena.edu`.

## Acceptance test plan

- Naming: run `npm run test:google-groups` to verify addresses with and without `-group`.
- Auto-create success: create a test role group and verify proposed and active addresses match and the action log records creation.
- Existing group: pre-create the proposed group, click Create Google Group, and verify it is adopted rather than recreated.
- Permission failure: use a delegated account without group-creation permission and verify the failure is visible while manual entry remains available.
- Manual fallback: enter an existing group address, save, test it, and verify it becomes active.
- Internal member: assign an internal test person and verify one membership plus a success log.
- External member: assign an approved external address and verify membership; if Siena policy rejects it, verify the assignment remains and the warning is visible.
- Already a member: repeat synchronization and verify the operation is idempotent.
- Welcome once: assign a person and verify one HTML welcome delivery.
- Manual resend: use Resend welcome and verify a second message plus `welcome_email_resent` in the log.
- Unassign with removal enabled: remove the assignment and verify only that group's membership is removed.
- Unassign with removal disabled: remove the assignment and verify membership remains.
- Provider failure: temporarily use invalid credentials and verify assignment status and the audit log contain the failure without exposing credentials.

Use designated test groups and addresses. Do not run acceptance tests against active production groups until Siena approves the API configuration.
