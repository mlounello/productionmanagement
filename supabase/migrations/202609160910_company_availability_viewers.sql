begin;

create table if not exists app_production_management.project_availability_viewers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects(id) on delete cascade,
  person_id uuid not null references app_production_management.people(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,person_id)
);

drop trigger if exists set_updated_at on app_production_management.project_availability_viewers;
create trigger set_updated_at before update on app_production_management.project_availability_viewers
for each row execute function app_production_management.set_updated_at();

alter table app_production_management.project_availability_viewers enable row level security;

drop policy if exists "availability viewers read own or managers" on app_production_management.project_availability_viewers;
create policy "availability viewers read own or managers"
on app_production_management.project_availability_viewers for select to authenticated
using (
  app_production_management.has_app_role(array['admin','producer'])
  or app_production_management.has_project_role(project_id,array['project_manager','producer'])
  or exists (
    select 1 from app_production_management.people person
    where person.id=person_id and person.auth_user_id=auth.uid()
  )
);

drop policy if exists "availability viewers managed by project managers" on app_production_management.project_availability_viewers;
create policy "availability viewers managed by project managers"
on app_production_management.project_availability_viewers for all to authenticated
using (
  app_production_management.has_app_role(array['admin','producer'])
  or app_production_management.has_project_role(project_id,array['project_manager','producer'])
)
with check (
  app_production_management.has_app_role(array['admin','producer'])
  or app_production_management.has_project_role(project_id,array['project_manager','producer'])
);

grant select,insert,update,delete on app_production_management.project_availability_viewers to authenticated;
grant select,insert,update,delete on app_production_management.project_availability_viewers to service_role;

commit;
