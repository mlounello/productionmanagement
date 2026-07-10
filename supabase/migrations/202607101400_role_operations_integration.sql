alter table app_production_management.project_roles
  add column if not exists playbill_sync_status text not null default 'not_ready',
  add column if not exists sync_notes text not null default '';

alter table app_production_management.role_assignments
  add column if not exists assignment_kind text not null default 'primary';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_roles_playbill_sync_status_check'
      and conrelid = 'app_production_management.project_roles'::regclass
  ) then
    alter table app_production_management.project_roles
      add constraint project_roles_playbill_sync_status_check
      check (playbill_sync_status in ('not_ready', 'pending', 'synced', 'failed', 'disabled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'role_assignments_assignment_kind_check'
      and conrelid = 'app_production_management.role_assignments'::regclass
  ) then
    alter table app_production_management.role_assignments
      add constraint role_assignments_assignment_kind_check
      check (assignment_kind in ('primary', 'shared', 'understudy', 'alternate'));
  end if;
end $$;

create index if not exists idx_pm_project_roles_playbill_sync
  on app_production_management.project_roles (project_id, playbill_sync_status);

create index if not exists idx_pm_role_assignments_kind
  on app_production_management.role_assignments (project_id, role_id, assignment_kind);
