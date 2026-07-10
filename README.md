# Production Management

Siena production operations platform for projects, durable people profiles, project roles, auditions, generated communications, recognition, and controlled integration with Playbill and Theatre Budget. Calendar, Gantt, and Run of Show planning views are supported, but the current MVP spine is people, roles, auditions, emails, and sync.

## Stack

- Next.js App Router + TypeScript
- Supabase Auth/Postgres/RLS
- Vercel
- App schema: `app_production_management`
- Shared app membership authority: `core.app_memberships`

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required Supabase env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `APP_SCHEMA=app_production_management`
- `NEXT_PUBLIC_APP_SCHEMA=app_production_management`
- `APP_ID=production_management`

## Supabase setup

Run migrations in `supabase/migrations` in order.

The first migration creates only the new `app_production_management` schema and inserts the new app/roles into `core`. It does not mutate Playbill or Theatre Budget data.

In Supabase Dashboard, add `app_production_management` to the exposed API schemas before deploying the app. The current hosted project exposes the existing app schemas, but not this new one yet.

After migration, grant yourself app access:

```sql
insert into core.app_memberships (user_id, app_id, role, is_active)
values ('YOUR_AUTH_USER_ID', 'production_management', 'admin', true)
on conflict (user_id, app_id) do update
set role = excluded.role,
    is_active = true,
    updated_at = now();
```

## Integration policy

Production Management, Playbill, and Theatre Budget share the same Supabase project but use different schemas. Cross-app writes must be deliberate, feature-gated, and traceable through local integration records.

- Playbill writes are gated by `ENABLE_PLAYBILL_WRITES`.
- Theatre Budget writes are gated by `ENABLE_BUDGET_WRITES`.
- Google Calendar writes are gated by `ENABLE_GOOGLE_CALENDAR_SYNC`.
- Integrations should use explicit `external_links` records so linked external rows can be audited, retried, or disconnected without guessing.
- Existing Theatre Budget guest artist rows are protected live records. Production Management may read and manually link to them, but must not automatically overwrite, delete, deactivate, or mutate them.
- Cross-app synced fields need clear ownership. Fields owned by Playbill or Theatre Budget should be read-only here unless a future review-and-confirm update flow is explicitly built.

## Product architecture direction

The app should use managed reference data for reusable institutional options rather than repeated free text. Core institutional entities such as departments and locations should have dedicated tables; lighter controlled vocabularies such as project types, event types, role groups, and future category lists should use a shared `reference_values` pattern.

The main MVP path is now:

- create projects
- define project roles
- assign people to roles
- mark assignment-specific guest artists
- keep durable person files with internal/client-visible notes, project history, role history, accomplishments, and eventual headshots
- create audition sessions, slots, paperwork, and submissions
- generate cast, crew, role confirmation, and ACTF/recognition emails
- sync selected people/role data to Playbill and link guest artist assignments to Theatre Budget through guarded integration records

Forms should use reusable searchable selectors with controlled "add new" flows where appropriate. Historical records should keep working when reference records are archived/inactive.

`calendar_items` is the production-event planning source of truth. Calendar, Gantt, and Run of Show should read from the same calendar item records; Run of Show is a projection of items marked `is_run_of_show_relevant`, not a separate event system. The existing `run_of_show_items` table is legacy/future extension detail only and should stay linked back to source calendar items if used later.

The long-term UI direction is a Siena-branded production-management shell inspired by clean Propared-style workflows: persistent left sidebar, top workspace header, compact lists/tables, right-side detail drawers, and a Settings/Admin area for reference data. Data integrity and selector patterns come before a full visual shell redesign.
