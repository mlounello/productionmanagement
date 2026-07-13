-- Project role-group Google Group automation and welcome-email delivery audit.

create table if not exists app_production_management.project_role_group_google_settings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects (id) on delete cascade,
  role_group text not null,
  google_group_mode text not null default 'disabled',
  proposed_google_group_email text not null default '',
  active_google_group_email text not null default '',
  google_group_creation_status text not null default 'not_attempted',
  google_group_creation_error text not null default '',
  google_group_sync_enabled boolean not null default false,
  welcome_email_enabled boolean not null default false,
  welcome_email_template_id uuid references app_production_management.email_templates (id) on delete set null,
  remove_from_google_group_on_unassign boolean not null default false,
  last_sync_status text not null default 'not_attempted',
  last_sync_error text not null default '',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, role_group),
  check (google_group_mode in ('auto', 'manual', 'disabled')),
  check (google_group_creation_status in ('not_attempted', 'created', 'failed', 'manual', 'disabled')),
  check (last_sync_status in ('not_attempted', 'synced', 'already_synced', 'failed', 'disabled', 'skipped'))
);

create table if not exists app_production_management.google_group_action_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects (id) on delete cascade,
  role_group text not null,
  role_assignment_id uuid references app_production_management.role_assignments (id) on delete set null,
  person_id uuid references app_production_management.people (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  email_address text not null default '',
  active_google_group_email text not null default '',
  action_type text not null,
  status text not null,
  error_message text not null default '',
  provider_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (action_type in (
    'group_created', 'group_creation_failed', 'group_found', 'group_tested',
    'member_added', 'member_add_failed', 'member_already_present',
    'member_removed', 'member_remove_failed', 'member_not_present',
    'welcome_email_sent', 'welcome_email_failed', 'welcome_email_resent'
  )),
  check (status in ('success', 'failed', 'skipped'))
);

create index if not exists idx_google_group_action_log_project_group
  on app_production_management.google_group_action_log (project_id, role_group, created_at desc);

create table if not exists app_production_management.google_group_welcome_deliveries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects (id) on delete cascade,
  role_group text not null,
  person_id uuid not null references app_production_management.people (id) on delete cascade,
  role_assignment_id uuid references app_production_management.role_assignments (id) on delete set null,
  template_id uuid references app_production_management.email_templates (id) on delete set null,
  email_message_id uuid references app_production_management.email_messages (id) on delete set null,
  to_email text not null,
  provider_message_id text not null default '',
  sent_at timestamptz not null default now(),
  resent_count integer not null default 0,
  last_resent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, role_group, person_id)
);

alter table app_production_management.role_assignments
  add column if not exists google_group_sync_status text not null default 'not_attempted',
  add column if not exists google_group_sync_error text not null default '',
  add column if not exists welcome_email_status text not null default 'not_attempted',
  add column if not exists welcome_email_error text not null default '';

alter table app_production_management.project_role_group_google_settings enable row level security;
alter table app_production_management.google_group_action_log enable row level security;
alter table app_production_management.google_group_welcome_deliveries enable row level security;

drop policy if exists "project managers role group google settings" on app_production_management.project_role_group_google_settings;
create policy "project managers role group google settings"
on app_production_management.project_role_group_google_settings
for all to authenticated
using (app_production_management.has_project_role(project_id, array['project_manager', 'producer']))
with check (app_production_management.has_project_role(project_id, array['project_manager', 'producer']));

drop policy if exists "project managers google action log" on app_production_management.google_group_action_log;
create policy "project managers google action log"
on app_production_management.google_group_action_log
for all to authenticated
using (app_production_management.has_project_role(project_id, array['project_manager', 'producer']))
with check (app_production_management.has_project_role(project_id, array['project_manager', 'producer']));

drop policy if exists "project managers welcome deliveries" on app_production_management.google_group_welcome_deliveries;
create policy "project managers welcome deliveries"
on app_production_management.google_group_welcome_deliveries
for all to authenticated
using (app_production_management.has_project_role(project_id, array['project_manager', 'producer']))
with check (app_production_management.has_project_role(project_id, array['project_manager', 'producer']));

grant select, insert, update, delete on table
  app_production_management.project_role_group_google_settings,
  app_production_management.google_group_action_log,
  app_production_management.google_group_welcome_deliveries
to authenticated;

do $$
declare target_table regclass;
begin
  foreach target_table in array array[
    'app_production_management.project_role_group_google_settings'::regclass,
    'app_production_management.google_group_welcome_deliveries'::regclass
  ] loop
    execute format('drop trigger if exists set_updated_at on %s', target_table);
    execute format('create trigger set_updated_at before update on %s for each row execute function app_production_management.set_updated_at()', target_table);
  end loop;
end $$;
