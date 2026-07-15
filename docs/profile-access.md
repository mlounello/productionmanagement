# Branded profile access

Production Management profile access mirrors Playbill contributor access:

1. The app creates an opaque, seven-day access token and stores only its SHA-256 hash.
2. Resend sends a branded HTML message containing the Production Management access-page URL.
3. Opening the email does not authenticate the recipient, so link scanners cannot consume the login session.
4. The recipient presses **Continue** on the access page.
5. The server creates and directly verifies a one-time Supabase token, stores the session in the app cookie, and sends the recipient to `/my-profile`.
6. The opaque access token is marked used and cannot be used again.

## Required production configuration

- `NEXT_PUBLIC_SITE_URL=https://productionmanagement.mlounello.com`
- `SUPABASE_SERVICE_ROLE_KEY`: the server-only service-role key for the shared Supabase project. Never prefix this variable with `NEXT_PUBLIC_`.
- `RESEND_API_KEY`: an API key allowed to send from the configured domain.
- `EMAIL_FROM`: the verified sender, for example `Siena Theatre Production Management <production@mlounello.com>`.
- `RESEND_MAX_REQUESTS_PER_SECOND=4`: optional safety override. The application will never configure itself above four requests per second, leaving room below Resend's standard five-request team limit.
- `RESEND_MAX_RETRIES=5`: optional retry count for per-second rate limits and temporary Resend failures. Resend's `Retry-After` and rate-limit reset headers take precedence over the backoff calculation.
- `DISABLE_OUTBOUND_EMAIL=false`

All email workflows use the same paced sender within an application instance. Campaigns use Resend's batch endpoint in groups of no more than 100 personalized messages, and every provider request uses an idempotency key so an automatic retry does not duplicate delivery. A daily or monthly quota error is not repeatedly retried because pacing cannot fix an exhausted account quota; unsent campaign recipients remain failed and visible so staff can resume them after the quota resets or the Resend plan changes.

Apply `supabase/migrations/202607132200_branded_profile_access_links.sql` before deploying the feature.

Also apply `supabase/migrations/202607132330_profile_link_service_role_privileges.sql`. Supabase service-role keys bypass row-level security but still need explicit table privileges in a custom schema. This migration grants only the reads and writes used by branded links, reminder emails, and unlocked publicity/headshot propagation.

## Customize the message

Open **Settings → Profile Access Email**. The subject and HTML body support:

- `{{person_name}}`
- `{{profile_access_url}}`
- `{{expires_in}}`

The profile URL variable must remain in the message so the recipient can open the access page.

The callback deliberately uses token verification rather than a PKCE code exchange. A recipient can open the branded message in a different browser or on a different device without receiving a “PKCE code verifier not found” error. Links generated before this callback was deployed should be replaced with a newly sent link.
