# Branded profile access

Production Management profile access mirrors Playbill contributor access:

1. The app creates an opaque, seven-day access token and stores only its SHA-256 hash.
2. Resend sends a branded HTML message containing the Production Management access-page URL.
3. Opening the email does not authenticate the recipient, so link scanners cannot consume the login session.
4. The recipient presses **Continue** on the access page.
5. The server creates a one-time Supabase token and sends the recipient directly to `/my-profile`.
6. The opaque access token is marked used and cannot be used again.

## Required production configuration

- `NEXT_PUBLIC_SITE_URL=https://productionmanagement.mlounello.com`
- `SUPABASE_SERVICE_ROLE_KEY`: the server-only service-role key for the shared Supabase project. Never prefix this variable with `NEXT_PUBLIC_`.
- `RESEND_API_KEY`: an API key allowed to send from the configured domain.
- `EMAIL_FROM`: the verified sender, for example `Siena Theatre Production Management <production@mlounello.com>`.
- `DISABLE_OUTBOUND_EMAIL=false`

Apply `supabase/migrations/202607132200_branded_profile_access_links.sql` before deploying the feature.

## Customize the message

Open **Settings → Profile Access Email**. The subject and HTML body support:

- `{{person_name}}`
- `{{profile_access_url}}`
- `{{expires_in}}`

The profile URL variable must remain in the message so the recipient can open the access page.
