begin;

insert into core.app_roles (app_id, role, description)
values ('production_management', 'owner', 'Single application owner with destructive data-management authority.')
on conflict (app_id, role) do update
set description = excluded.description;

update core.app_memberships membership
set role = 'owner'
from auth.users account
where membership.user_id = account.id
  and membership.app_id = 'production_management'
  and membership.is_active = true
  and lower(account.email) = 'mlounello@siena.edu';

create unique index if not exists uq_production_management_single_active_owner
on core.app_memberships (app_id)
where app_id = 'production_management'
  and lower(role) = 'owner'
  and is_active = true;

create or replace function app_production_management.get_user_role()
returns text
language sql
stable
security definer
set search_path = app_production_management, core, public
as $$
  select coalesce((
    select lower(am.role)
    from core.app_memberships am
    where am.user_id = auth.uid()
      and am.app_id = 'production_management'
      and am.is_active = true
    order by case lower(am.role)
      when 'owner' then 6
      when 'admin' then 5
      when 'producer' then 4
      when 'staff' then 3
      when 'faculty' then 2
      when 'guest' then 1
      else 0
    end desc
    limit 1
  ), 'none');
$$;

create or replace function app_production_management.has_app_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = app_production_management, core, public
as $$
  select app_production_management.get_user_role() = 'owner'
    or app_production_management.get_user_role() = any(allowed_roles);
$$;

drop policy if exists "people manage staff" on app_production_management.people;

drop policy if exists "people insert staff" on app_production_management.people;
create policy "people insert staff" on app_production_management.people
for insert to authenticated
with check (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']));

drop policy if exists "people update staff" on app_production_management.people;
create policy "people update staff" on app_production_management.people
for update to authenticated
using (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']))
with check (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']));

revoke delete on app_production_management.people from authenticated;

create or replace function app_production_management.delete_person_as_owner(
  target_person_id uuid,
  confirmation_full_name text
)
returns text
language plpgsql
security definer
set search_path = app_production_management, core, auth, public
as $$
declare
  target_name text;
  target_user_id uuid;
  assignment_count integer;
begin
  if app_production_management.get_user_role() <> 'owner' then
    raise exception 'Only the Production Management owner can permanently delete a person.';
  end if;

  select full_name, auth_user_id
  into target_name, target_user_id
  from app_production_management.people
  where id = target_person_id
  for update;

  if target_name is null then
    raise exception 'Person not found.';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'The owner cannot delete their own linked person record.';
  end if;
  if lower(btrim(coalesce(confirmation_full_name, ''))) <> lower(btrim(target_name)) then
    raise exception 'Type the person''s full name exactly to confirm deletion.';
  end if;

  select count(*) into assignment_count
  from app_production_management.role_assignments
  where person_id = target_person_id;
  if assignment_count > 0 then
    raise exception 'Remove all role assignments before permanently deleting this person.';
  end if;

  delete from app_production_management.external_links
  where local_entity_type = 'person'
    and local_entity_id = target_person_id;

  if target_user_id is not null then
    delete from app_production_management.project_memberships
    where user_id = target_user_id;
    delete from core.app_memberships
    where user_id = target_user_id
      and app_id = 'production_management';
  end if;

  insert into app_production_management.audit_log (
    entity_type, entity_id, action, before_value, changed_by, reason
  )
  values (
    'person', target_person_id, 'person_permanently_deleted',
    jsonb_build_object('full_name', target_name, 'auth_user_id', target_user_id),
    auth.uid(), 'Owner-confirmed permanent deletion'
  );

  delete from app_production_management.people
  where id = target_person_id;

  return target_name;
end;
$$;

revoke all on function app_production_management.delete_person_as_owner(uuid, text) from public;
grant execute on function app_production_management.delete_person_as_owner(uuid, text) to authenticated;

commit;
