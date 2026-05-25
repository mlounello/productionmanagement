create table if not exists app_production_management.project_locations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects (id) on delete cascade,
  location_id uuid not null references app_production_management.locations (id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, location_id)
);

create index if not exists idx_pm_project_locations_project
on app_production_management.project_locations (project_id, sort_order);

create index if not exists idx_pm_project_locations_location
on app_production_management.project_locations (location_id);

alter table app_production_management.project_locations enable row level security;

drop policy if exists "projects delete managers" on app_production_management.projects;
create policy "projects delete managers" on app_production_management.projects
for delete to authenticated
using (app_production_management.has_project_role(id, array['project_manager', 'producer']));

drop policy if exists "project locations read project" on app_production_management.project_locations;
create policy "project locations read project" on app_production_management.project_locations
for select to authenticated
using (app_production_management.is_project_member(project_id));

drop policy if exists "project locations manage managers" on app_production_management.project_locations;
create policy "project locations manage managers" on app_production_management.project_locations
for all to authenticated
using (app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head', 'staff']))
with check (app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head', 'staff']));

grant select, insert, update, delete on app_production_management.project_locations to authenticated;
grant all on app_production_management.project_locations to service_role;
