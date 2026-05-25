create table if not exists app_production_management.project_timeline_groups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects (id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null default '',
  color_key text not null default 'green',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slug)
);

alter table app_production_management.calendar_items
  add column if not exists timeline_group_id uuid references app_production_management.project_timeline_groups (id) on delete set null;

create index if not exists idx_pm_timeline_groups_project_active_sort
on app_production_management.project_timeline_groups (project_id, is_active, sort_order, name);

create index if not exists idx_pm_calendar_timeline_group
on app_production_management.calendar_items (timeline_group_id);

drop trigger if exists set_updated_at on app_production_management.project_timeline_groups;
create trigger set_updated_at
before update on app_production_management.project_timeline_groups
for each row execute function app_production_management.set_updated_at();

alter table app_production_management.project_timeline_groups enable row level security;

drop policy if exists "timeline groups read project" on app_production_management.project_timeline_groups;
create policy "timeline groups read project" on app_production_management.project_timeline_groups
for select to authenticated
using (app_production_management.is_project_member(project_id));

drop policy if exists "timeline groups manage project" on app_production_management.project_timeline_groups;
create policy "timeline groups manage project" on app_production_management.project_timeline_groups
for all to authenticated
using (app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head', 'staff']))
with check (app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head', 'staff']));

grant select, insert, update, delete on app_production_management.project_timeline_groups to authenticated;
grant all on app_production_management.project_timeline_groups to service_role;
