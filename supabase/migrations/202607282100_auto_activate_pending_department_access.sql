begin;

create or replace function app_production_management.activate_pending_department_budget_access(
  target_user_id uuid,
  target_email text
)
returns integer
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, auth, public
as $$
declare
  access_record record;
  activated_count integer := 0;
begin
  if target_user_id is null then
    return 0;
  end if;

  for access_record in
    select
      access.role_assignment_id,
      array_agg(access.production_category_id order by access.production_category_id) as category_ids
    from app_production_management.role_assignment_budget_access access
    join app_production_management.role_assignments assignment
      on assignment.id = access.role_assignment_id
    join app_production_management.people person
      on person.id = assignment.person_id
    where access.active
      and access.status = 'pending_account'
      and not access.access_not_required
      and access.production_category_id is not null
      and (
        person.auth_user_id = target_user_id
        or (
          nullif(trim(coalesce(target_email, '')), '') is not null
          and lower(trim(person.email)) = lower(trim(target_email))
        )
      )
    group by access.role_assignment_id
  loop
    perform app_production_management.set_assignment_department_budget_access(
      access_record.role_assignment_id,
      access_record.category_ids,
      false
    );
    activated_count := activated_count + 1;
  end loop;

  return activated_count;
end;
$$;

create or replace function app_production_management.activate_pending_department_budget_access_from_auth()
returns trigger
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, auth, public
as $$
begin
  if new.deleted_at is null then
    perform app_production_management.activate_pending_department_budget_access(new.id, new.email);
  end if;
  return new;
end;
$$;

drop trigger if exists activate_pending_department_budget_access
  on auth.users;
create trigger activate_pending_department_budget_access
after insert or update of email, deleted_at
on auth.users
for each row execute function app_production_management.activate_pending_department_budget_access_from_auth();

create or replace function app_production_management.activate_pending_department_budget_access_from_person()
returns trigger
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, auth, public
as $$
declare
  account_email text;
begin
  if new.auth_user_id is not null
    and (
      old.auth_user_id is distinct from new.auth_user_id
      or old.email is distinct from new.email
    ) then
    select account.email
    into account_email
    from auth.users account
    where account.id = new.auth_user_id
      and account.deleted_at is null;

    perform app_production_management.activate_pending_department_budget_access(
      new.auth_user_id,
      coalesce(account_email, new.email)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists activate_pending_department_budget_access
  on app_production_management.people;
create trigger activate_pending_department_budget_access
after update of auth_user_id, email
on app_production_management.people
for each row execute function app_production_management.activate_pending_department_budget_access_from_person();

alter function app_production_management.activate_pending_department_budget_access(uuid, text)
  owner to postgres;
alter function app_production_management.activate_pending_department_budget_access_from_auth()
  owner to postgres;
alter function app_production_management.activate_pending_department_budget_access_from_person()
  owner to postgres;

revoke all on function app_production_management.activate_pending_department_budget_access(uuid, text)
from public, anon, authenticated;
revoke all on function app_production_management.activate_pending_department_budget_access_from_auth()
from public, anon, authenticated;
revoke all on function app_production_management.activate_pending_department_budget_access_from_person()
from public, anon, authenticated;

commit;
