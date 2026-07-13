create table if not exists app_production_management.profile_access_links (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references app_production_management.people (id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_pm_profile_access_person_created
  on app_production_management.profile_access_links (person_id, created_at desc);
create index if not exists idx_pm_profile_access_expiry
  on app_production_management.profile_access_links (expires_at)
  where used_at is null;

alter table app_production_management.profile_access_links enable row level security;
-- Deliberately no client policies. These bearer-token records are read only by
-- the server-side service-role client.

comment on table app_production_management.profile_access_links is
  'Opaque, expiring email access links. The emailed page does not authenticate until the recipient explicitly presses Continue.';
