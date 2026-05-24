# Production Management

Siena production operations platform for projects, durable people profiles, production calendars, Gantt charts, run of show, auditions, role assignments, recognition, scheduling, inventory, road cases, quotes, invoices, and controlled integration with Playbill and Theatre Budget.

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

After migration, grant yourself app access:

```sql
insert into core.app_memberships (user_id, app_id, role, is_active)
values ('YOUR_AUTH_USER_ID', 'production_management', 'admin', true)
on conflict (user_id, app_id) do update
set role = excluded.role,
    is_active = true,
    updated_at = now();
```

## Integration freeze

- Theatre Budget writes stay disabled until after June 1, 2026.
- Playbill writes stay disabled until after June 7, 2026.
- Until then, integrations should use read-only references and `external_links`.

