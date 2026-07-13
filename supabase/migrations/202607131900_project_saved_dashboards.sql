create table if not exists app_production_management.project_dashboard_views (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  visibility text not null default 'private',
  layout jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, owner_user_id, name),
  check (visibility in ('private', 'project')),
  check (jsonb_typeof(layout) = 'array')
);

create unique index if not exists uq_pm_dashboard_default_per_user_project
  on app_production_management.project_dashboard_views (project_id, owner_user_id)
  where is_default = true;

create index if not exists idx_pm_dashboard_project_owner
  on app_production_management.project_dashboard_views (project_id, owner_user_id, updated_at desc);

drop trigger if exists set_updated_at on app_production_management.project_dashboard_views;
create trigger set_updated_at
before update on app_production_management.project_dashboard_views
for each row execute function app_production_management.set_updated_at();

alter table app_production_management.project_dashboard_views enable row level security;

drop policy if exists "dashboard views read owner or project" on app_production_management.project_dashboard_views;
create policy "dashboard views read owner or project"
on app_production_management.project_dashboard_views
for select to authenticated
using (
  owner_user_id = auth.uid()
  or (visibility = 'project' and app_production_management.is_project_member(project_id))
);

drop policy if exists "dashboard views create owner" on app_production_management.project_dashboard_views;
create policy "dashboard views create owner"
on app_production_management.project_dashboard_views
for insert to authenticated
with check (
  owner_user_id = auth.uid()
  and app_production_management.is_project_member(project_id)
);

drop policy if exists "dashboard views update owner" on app_production_management.project_dashboard_views;
create policy "dashboard views update owner"
on app_production_management.project_dashboard_views
for update to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists "dashboard views delete owner" on app_production_management.project_dashboard_views;
create policy "dashboard views delete owner"
on app_production_management.project_dashboard_views
for delete to authenticated
using (owner_user_id = auth.uid());

grant select, insert, update, delete on app_production_management.project_dashboard_views to authenticated;

comment on table app_production_management.project_dashboard_views is
  'Named, reusable project dashboards. Layout contains ordered module keys and presentation sizes.';
