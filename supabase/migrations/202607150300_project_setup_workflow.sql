begin;

create table if not exists app_production_management.project_setup_preferences (
  project_id uuid primary key references app_production_management.projects (id) on delete cascade,
  setup_status text not null default 'in_progress',
  current_step text not null default 'workflow',
  uses_role_acceptance boolean not null default true,
  uses_google_groups boolean not null default true,
  uses_propared boolean not null default true,
  uses_playbill boolean not null default true,
  uses_publicity boolean not null default true,
  uses_auditions boolean not null default true,
  uses_budget boolean not null default true,
  selected_role_groups text[] not null default array['cast','creative_team','directorial_team','production_team','administrative','front_of_house','music_band']::text[],
  completed_at timestamptz,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (setup_status in ('in_progress', 'complete')),
  check (current_step in ('workflow', 'roles', 'onboarding', 'communications', 'integrations', 'review'))
);

drop trigger if exists set_updated_at on app_production_management.project_setup_preferences;
create trigger set_updated_at before update on app_production_management.project_setup_preferences
for each row execute function app_production_management.set_updated_at();

alter table app_production_management.project_setup_preferences enable row level security;

drop policy if exists "project setup read members" on app_production_management.project_setup_preferences;
create policy "project setup read members"
on app_production_management.project_setup_preferences for select to authenticated
using (app_production_management.is_project_member(project_id));

drop policy if exists "project setup manage managers" on app_production_management.project_setup_preferences;
create policy "project setup manage managers"
on app_production_management.project_setup_preferences for all to authenticated
using (
  app_production_management.has_app_role(array['admin', 'producer'])
  or app_production_management.has_project_role(project_id, array['project_manager', 'producer'])
)
with check (
  app_production_management.has_app_role(array['admin', 'producer'])
  or app_production_management.has_project_role(project_id, array['project_manager', 'producer'])
);

grant select, insert, update, delete on app_production_management.project_setup_preferences to authenticated;

-- Existing projects keep their current behavior and are treated as already
-- introduced to setup. Newly created projects explicitly start in progress.
insert into app_production_management.project_setup_preferences (
  project_id, setup_status, current_step, completed_at
)
select id, 'complete', 'review', now()
from app_production_management.projects
on conflict (project_id) do nothing;

commit;
