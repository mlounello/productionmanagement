alter table app_production_management.calendar_items
  add column if not exists is_run_of_show_relevant boolean not null default false,
  add column if not exists run_of_show_order integer,
  add column if not exists cue_number text not null default '',
  add column if not exists duration_minutes integer,
  add column if not exists run_of_show_notes text not null default '';

create index if not exists idx_pm_calendar_run_of_show
on app_production_management.calendar_items (
  project_id,
  is_run_of_show_relevant,
  starts_at,
  due_at,
  ends_at,
  run_of_show_order,
  cue_number,
  title
);
