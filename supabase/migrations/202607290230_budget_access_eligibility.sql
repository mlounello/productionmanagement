begin;

alter table app_production_management.people
  add column if not exists is_siena_employee boolean not null default false;

alter table app_production_management.project_roles
  add column if not exists budget_access_expected boolean not null default false;

do $$
declare
  definition text;
begin
  select pg_get_functiondef(
    'app_production_management.set_assignment_department_budget_access(uuid,uuid[],boolean)'::regprocedure
  ) into definition;

  definition := replace(
    definition,
    E'    assignment.is_guest_artist,\n    role.name as role_name,',
    E'    assignment.is_guest_artist,\n    role.budget_access_expected,\n    person.is_siena_employee,\n    role.name as role_name,'
  );
  definition := replace(
    definition,
    E'  if assignment_record.id is null or not assignment_record.is_guest_artist then\n    raise exception ''Only guest artist assignments can receive Theatre Budget department access.'';\n  end if;',
    E'  if assignment_record.id is null or not (\n    assignment_record.is_guest_artist\n    or assignment_record.is_siena_employee\n    or assignment_record.budget_access_expected\n  ) then\n    raise exception ''Only guest artists, Siena employees, or assignments in roles marked for Budget access can receive department access.'';\n  end if;'
  );

  execute definition;
end $$;

create or replace function app_production_management.clear_department_budget_access_on_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, public
as $$
declare
  remains_eligible boolean;
begin
  if tg_op = 'DELETE' then
    perform app_production_management.clear_assignment_department_budget_access(old.id);
    return old;
  end if;

  if old.person_id is distinct from new.person_id then
    perform app_production_management.clear_assignment_department_budget_access(old.id);
    return new;
  end if;

  select (
    new.is_guest_artist
    or coalesce(person.is_siena_employee, false)
    or coalesce(role.budget_access_expected, false)
  )
  into remains_eligible
  from app_production_management.people person
  join app_production_management.project_roles role on role.id = new.role_id
  where person.id = new.person_id;

  if not coalesce(remains_eligible, false) then
    perform app_production_management.clear_assignment_department_budget_access(old.id);
  end if;
  return new;
end;
$$;

alter function app_production_management.clear_department_budget_access_on_assignment_change()
  owner to postgres;

commit;
