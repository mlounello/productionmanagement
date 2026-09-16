begin;

-- Casting preparation is intentionally separate from role_assignments: creating
-- an assignment invokes existing publicity/onboarding workflows. No existing
-- person, audition, role, agreement, or assignment rows are changed here.
create table if not exists app_production_management.casting_drafts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects(id) on delete cascade,
  person_id uuid not null references app_production_management.people(id) on delete cascade,
  role_id uuid not null references app_production_management.project_roles(id) on delete restrict,
  coverage_type text not null default 'none' check (coverage_type in ('none','understudy','swing')),
  covered_role_ids uuid[] not null default '{}',
  additional_duties text not null default '' check (char_length(additional_duties) <= 5000),
  actor_notes text not null default '' check (char_length(actor_notes) <= 10000),
  status text not null default 'draft' check (status in ('draft','withdrawn')),
  revision integer not null default 1 check (revision > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((coverage_type = 'none' and cardinality(covered_role_ids) = 0)
      or (coverage_type <> 'none' and cardinality(covered_role_ids) > 0))
);

create unique index if not exists casting_drafts_active_person_role
  on app_production_management.casting_drafts(project_id,person_id,role_id)
  where status = 'draft';
create index if not exists casting_drafts_project on app_production_management.casting_drafts(project_id);

create or replace function app_production_management.validate_casting_draft()
returns trigger language plpgsql
set search_path = app_production_management, pg_temp as $$
begin
  if not exists(select 1 from project_roles where id = new.role_id and project_id = new.project_id) then
    raise exception 'Choose a role from this project.';
  end if;
  if exists(select 1 from unnest(new.covered_role_ids) role_id
    where not exists(select 1 from project_roles r where r.id = role_id and r.project_id = new.project_id)) then
    raise exception 'Covered roles must belong to this project.';
  end if;
  if tg_op = 'UPDATE' then
    if new.project_id <> old.project_id or new.person_id <> old.person_id then
      raise exception 'A casting draft cannot be moved to another project or person.';
    end if;
    new.revision := old.revision + 1;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  else
    new.revision := 1;
    new.created_by := auth.uid();
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists validate_casting_draft on app_production_management.casting_drafts;
create trigger validate_casting_draft before insert or update on app_production_management.casting_drafts
  for each row execute function app_production_management.validate_casting_draft();

alter table app_production_management.casting_drafts enable row level security;
create policy "production managers manage casting drafts" on app_production_management.casting_drafts
for all to authenticated
using (app_production_management.has_app_role(array['admin','producer'])
  or app_production_management.has_project_role(project_id,array['project_manager','producer']))
with check (app_production_management.has_app_role(array['admin','producer'])
  or app_production_management.has_project_role(project_id,array['project_manager','producer']));
grant select,insert,update on app_production_management.casting_drafts to authenticated;
grant select,insert,update on app_production_management.casting_drafts to service_role;
-- Draft withdrawal is reversible. There is intentionally no app DELETE grant.
notify pgrst, 'reload schema';
commit;
