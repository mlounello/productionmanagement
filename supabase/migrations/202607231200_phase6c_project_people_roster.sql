begin;

create table if not exists app_production_management.project_people (
  project_id uuid not null references app_production_management.projects(id) on delete cascade,
  person_id uuid not null references app_production_management.people(id) on delete cascade,
  source text not null default 'manual',
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, person_id),
  check (source in ('manual', 'assignment'))
);

insert into app_production_management.project_people (project_id, person_id, source)
select distinct project_id, person_id, 'assignment'
from app_production_management.role_assignments
on conflict (project_id, person_id) do nothing;

drop trigger if exists set_updated_at on app_production_management.project_people;
create trigger set_updated_at
before update on app_production_management.project_people
for each row execute function app_production_management.set_updated_at();

create or replace function app_production_management.add_assignment_person_to_project_roster()
returns trigger
language plpgsql
security invoker
set search_path = app_production_management, public
as $$
begin
  insert into app_production_management.project_people (project_id, person_id, source)
  values (new.project_id, new.person_id, 'assignment')
  on conflict (project_id, person_id) do nothing;
  return new;
end;
$$;

drop trigger if exists add_assignment_person_to_project_roster
on app_production_management.role_assignments;
create trigger add_assignment_person_to_project_roster
after insert on app_production_management.role_assignments
for each row execute function app_production_management.add_assignment_person_to_project_roster();

alter table app_production_management.project_people enable row level security;

drop policy if exists "project people read project" on app_production_management.project_people;
create policy "project people read project"
on app_production_management.project_people
for select to authenticated
using (app_production_management.is_project_member(project_id));

drop policy if exists "project people manage staff" on app_production_management.project_people;
create policy "project people manage staff"
on app_production_management.project_people
for all to authenticated
using (
  app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty'])
  or app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head'])
)
with check (
  app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty'])
  or app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head'])
);

grant select, insert, update, delete
on app_production_management.project_people
to authenticated, service_role;

create or replace function app_production_management.create_project_person(
  p_project_id uuid,
  p_full_name text,
  p_first_name text default '',
  p_last_name text default '',
  p_preferred_name text default '',
  p_email text default '',
  p_vendor_number text default '',
  p_phone text default '',
  p_pronouns text default '',
  p_affiliation text default '',
  p_person_type text default 'person'
)
returns uuid
language plpgsql
security invoker
set search_path = app_production_management, public
as $$
declare
  created_person_id uuid;
begin
  if not (
    app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty'])
    or app_production_management.has_project_role(
      p_project_id,
      array['project_manager', 'producer', 'department_head']
    )
  ) then
    raise exception 'Not authorized to add people to this project.';
  end if;

  insert into app_production_management.people (
    first_name,
    last_name,
    preferred_name,
    full_name,
    email,
    vendor_number,
    phone,
    pronouns,
    affiliation,
    person_type
  )
  values (
    coalesce(p_first_name, ''),
    coalesce(p_last_name, ''),
    coalesce(p_preferred_name, ''),
    p_full_name,
    coalesce(p_email, ''),
    coalesce(p_vendor_number, ''),
    coalesce(p_phone, ''),
    coalesce(p_pronouns, ''),
    coalesce(p_affiliation, ''),
    p_person_type
  )
  returning id into created_person_id;

  insert into app_production_management.project_people (
    project_id,
    person_id,
    source,
    added_by
  )
  values (
    p_project_id,
    created_person_id,
    'manual',
    auth.uid()
  );

  return created_person_id;
end;
$$;

revoke all on function app_production_management.create_project_person(
  uuid, text, text, text, text, text, text, text, text, text, text
) from public, anon;
grant execute on function app_production_management.create_project_person(
  uuid, text, text, text, text, text, text, text, text, text, text
) to authenticated, service_role;

commit;
