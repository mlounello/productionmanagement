begin;

alter table app_production_management.project_google_calendar_settings
  add column if not exists bridge_version integer not null default 1;

commit;
