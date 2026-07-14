begin;
create table if not exists app_production_management.project_role_acceptance_settings(
  project_id uuid primary key references app_production_management.projects(id) on delete cascade,
  cast_introduction text not null default '', cast_sections jsonb,
  crew_introduction text not null default '', crew_sections jsonb,
  expires_days integer not null default 14, auto_send boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(expires_days between 1 and 90)
);
drop trigger if exists set_updated_at on app_production_management.project_role_acceptance_settings;
create trigger set_updated_at before update on app_production_management.project_role_acceptance_settings for each row execute function app_production_management.set_updated_at();
alter table app_production_management.project_role_acceptance_settings enable row level security;
create policy "project staff manage acceptance settings" on app_production_management.project_role_acceptance_settings for all to authenticated
using(app_production_management.has_project_role(project_id,array['project_manager','producer','department_head','staff']) or app_production_management.has_app_role(array['admin','producer']))
with check(app_production_management.has_project_role(project_id,array['project_manager','producer','department_head','staff']) or app_production_management.has_app_role(array['admin','producer']));
grant select,insert,update,delete on app_production_management.project_role_acceptance_settings to authenticated,service_role;
commit;
