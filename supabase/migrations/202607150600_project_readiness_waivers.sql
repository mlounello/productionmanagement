begin;

create table if not exists app_production_management.project_readiness_waivers(
  project_id uuid not null references app_production_management.projects(id) on delete cascade,
  item_id text not null,
  reason text not null default 'Not required for this project',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(project_id,item_id)
);

alter table app_production_management.project_readiness_waivers enable row level security;
drop policy if exists "project staff manage readiness waivers" on app_production_management.project_readiness_waivers;
create policy "project staff manage readiness waivers" on app_production_management.project_readiness_waivers for all to authenticated
using(app_production_management.has_project_role(project_id,array['project_manager','producer','department_head','staff']) or app_production_management.has_app_role(array['admin','producer']))
with check(app_production_management.has_project_role(project_id,array['project_manager','producer','department_head','staff']) or app_production_management.has_app_role(array['admin','producer']));

grant select,insert,update,delete on app_production_management.project_readiness_waivers to authenticated,service_role;

commit;
