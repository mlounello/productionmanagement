begin;

-- Separate, server-only credentials. No person, audition, agreement, or assignment is changed.
create table app_production_management.gmail_connection (
  id boolean primary key default true check (id),
  email text not null check (email = 'mlounello@siena.edu'),
  encrypted_refresh_token text not null,
  scopes text[] not null,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_checked_at timestamptz,
  last_check_error text,
  last_test_sent_at timestamptz
);
alter table app_production_management.gmail_connection enable row level security;
revoke all on app_production_management.gmail_connection from public, anon, authenticated;
grant select, insert, update, delete on app_production_management.gmail_connection to service_role;

-- A test click is claimed before contacting Gmail. Uncertain outcomes are never automatically retried.
create table app_production_management.gmail_connection_tests (
  id uuid primary key,
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','sent','failed','uncertain')),
  provider_message_id text,
  error_message text
);
alter table app_production_management.gmail_connection_tests enable row level security;
revoke all on app_production_management.gmail_connection_tests from public, anon, authenticated;
grant select, insert, update on app_production_management.gmail_connection_tests to service_role;
commit;
