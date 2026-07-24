begin;

alter table app_production_management.project_publicity_settings
  add column if not exists reminder_automation_enabled boolean not null default true,
  add column if not exists reminder_cadence_days integer not null default 7,
  add column if not exists reminder_due_soon_days integer not null default 7,
  add column if not exists reminder_send_last_day boolean not null default true,
  add column if not exists last_automatic_reminder_run_at timestamptz,
  add column if not exists last_automatic_reminder_result jsonb not null default '{}'::jsonb;

alter table app_production_management.project_publicity_settings
  drop constraint if exists project_publicity_settings_reminder_cadence_days_check,
  add constraint project_publicity_settings_reminder_cadence_days_check
    check (reminder_cadence_days between 1 and 30),
  drop constraint if exists project_publicity_settings_reminder_due_soon_days_check,
  add constraint project_publicity_settings_reminder_due_soon_days_check
    check (reminder_due_soon_days between 1 and 30);

alter table app_production_management.email_messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists app_production_management.publicity_reminder_dispatches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects (id) on delete cascade,
  submission_id uuid not null references app_production_management.project_publicity_submissions (id) on delete cascade,
  scheduled_for date not null,
  reason text not null,
  status text not null default 'sending',
  to_email text not null default '',
  provider_message_id text,
  error_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, scheduled_for),
  check (reason in ('eligible_cadence', 'eligible_due_date')),
  check (status in ('sending', 'sent', 'failed'))
);

drop trigger if exists set_updated_at on app_production_management.publicity_reminder_dispatches;
create trigger set_updated_at before update on app_production_management.publicity_reminder_dispatches
for each row execute function app_production_management.set_updated_at();

alter table app_production_management.publicity_reminder_dispatches enable row level security;

drop policy if exists "publicity reminder dispatch project staff read" on app_production_management.publicity_reminder_dispatches;
create policy "publicity reminder dispatch project staff read"
on app_production_management.publicity_reminder_dispatches for select to authenticated
using (
  app_production_management.has_app_role(array['admin', 'producer'])
  or app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head', 'staff'])
);

grant select on app_production_management.publicity_reminder_dispatches to authenticated;
grant all on app_production_management.publicity_reminder_dispatches to service_role;

commit;
