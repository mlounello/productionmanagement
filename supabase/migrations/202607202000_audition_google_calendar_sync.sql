begin;

create table if not exists app_production_management.project_google_calendar_settings (
  project_id uuid primary key references app_production_management.projects(id) on delete cascade,
  enabled boolean not null default false,
  calendar_id text not null default 'primary',
  invite_directorial_team boolean not null default true,
  additional_guest_emails text[] not null default '{}',
  last_tested_at timestamptz,
  last_error text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table app_production_management.audition_slots add column if not exists google_calendar_event_id text;
alter table app_production_management.audition_slots add column if not exists google_calendar_sync_status text not null default 'not_synced';
alter table app_production_management.audition_slots add column if not exists google_calendar_sync_error text not null default '';
alter table app_production_management.audition_slots add column if not exists google_calendar_synced_at timestamptz;
alter table app_production_management.audition_submissions add column if not exists google_calendar_sync_status text not null default 'not_synced';
alter table app_production_management.audition_submissions add column if not exists google_calendar_sync_error text not null default '';
alter table app_production_management.audition_submissions add column if not exists google_calendar_synced_at timestamptz;

grant select,insert,update,delete on app_production_management.project_google_calendar_settings to authenticated,service_role;
alter table app_production_management.project_google_calendar_settings enable row level security;
drop policy if exists "audition managers calendar settings" on app_production_management.project_google_calendar_settings;
create policy "audition managers calendar settings" on app_production_management.project_google_calendar_settings for all to authenticated
using (app_production_management.can_manage_auditions(project_id)) with check (app_production_management.can_manage_auditions(project_id));

commit;
