begin;

-- Preserve deliberate department grants by marking their roles as access roles.
-- Exemptions created only to silence the former blanket guest-artist warning
-- are no longer necessary.
update app_production_management.project_roles role
set budget_access_expected = true
where exists (
  select 1
  from app_production_management.role_assignments assignment
  join app_production_management.role_assignment_budget_access access
    on access.role_assignment_id = assignment.id
  where assignment.role_id = role.id
    and access.active
    and not access.access_not_required
);

delete from app_production_management.role_assignment_budget_access access
using app_production_management.role_assignments assignment,
      app_production_management.project_roles role
where access.role_assignment_id = assignment.id
  and role.id = assignment.role_id
  and access.access_not_required
  and not role.budget_access_expected;

do $$
declare
  definition text;
begin
  select pg_get_functiondef(
    'app_production_management.set_assignment_department_budget_access(uuid,uuid[],boolean)'::regprocedure
  ) into definition;

  definition := replace(
    definition,
    E'    assignment_record.is_guest_artist\n    or assignment_record.is_siena_employee\n    or assignment_record.budget_access_expected',
    E'    assignment_record.is_siena_employee\n    or assignment_record.budget_access_expected'
  );
  definition := replace(
    definition,
    'Only guest artists, Siena employees, or assignments in roles marked for Budget access can receive department access.',
    'Only Siena employees or assignments in roles marked for Budget access can receive department access.'
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
    coalesce(person.is_siena_employee, false)
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
