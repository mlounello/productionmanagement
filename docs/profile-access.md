# Branded profile access

Production Management profile access mirrors Playbill contributor access:

1. The app creates an opaque, seven-day access token and stores only its SHA-256 hash.
2. Siena Gmail sends a branded HTML message containing the Production Management access-page URL.
3. Opening the email does not authenticate the recipient, so link scanners cannot consume the login session.
4. The recipient presses **Continue** on the access page.
5. The server creates and directly verifies a one-time Supabase token, stores the session in the app cookie, and sends the recipient to `/my-profile`.
6. The opaque access token is marked used and cannot be used again.

## Required production configuration

- `NEXT_PUBLIC_SITE_URL=https://productionmanagement.mlounello.com`
- `SUPABASE_SERVICE_ROLE_KEY`: the server-only service-role key for the shared Supabase project. Never prefix this variable with `NEXT_PUBLIC_`.
- `PM_GMAIL_CLIENT_ID`, `PM_GMAIL_CLIENT_SECRET`, and `PM_GMAIL_ENCRYPTION_KEY`: the protected credentials used by the connected Siena Gmail account.
- All Production Management delivery is enforced as `Siena Theatre Production Management <mlounello@siena.edu>`; an individual workflow cannot substitute a different sender.

The shared delivery layer wraps every outgoing HTML message in the Siena Theatre Production Management layout. Specialized welcome and publicity layouts carry the same branding marker and are not wrapped twice.

Inbox avatars are controlled by each receiving email client, not by the message HTML or Gmail API. Configure the profile image on `mlounello@siena.edu`; display still depends on the receiving client.
- `PM_GMAIL_MAX_MESSAGES_PER_24_HOURS=500`: optional application safety cap for the Gmail queue.
- `DISABLE_OUTBOUND_EMAIL=false`

All email workflows use the same durable, paced Siena Gmail queue. Every recipient is stored before Gmail is contacted. Rate-limited jobs remain queued, confirmed failures remain visible for manual retry, and uncertain outcomes are held for review in Siena Sent rather than blindly resent.

Apply `supabase/migrations/202607132200_branded_profile_access_links.sql` before deploying the feature.

Also apply `supabase/migrations/202607132330_profile_link_service_role_privileges.sql`. Supabase service-role keys bypass row-level security but still need explicit table privileges in a custom schema. This migration grants only the reads and writes used by branded links, reminder emails, and unlocked publicity/headshot propagation.

## Customize the message

Open **Settings → Profile Access Email**. The subject and HTML body support:

- `{{person_name}}`
- `{{profile_access_url}}`
- `{{expires_in}}`

The profile URL variable must remain in the message so the recipient can open the access page.

The callback deliberately uses token verification rather than a PKCE code exchange. A recipient can open the branded message in a different browser or on a different device without receiving a “PKCE code verifier not found” error. Links generated before this callback was deployed should be replaced with a newly sent link.
