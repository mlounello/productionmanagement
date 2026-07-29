begin;

create table if not exists app_production_management.role_assignment_budget_access (
  id uuid primary key default gen_random_uuid(),
  role_assignment_id uuid not null references app_production_management.role_assignments (id) on delete cascade,
  production_category_id uuid references app_theatre_budget.production_categories (id) on delete restrict,
  access_role text not null default 'viewer',
  active boolean not null default true,
  created_by_user_id uuid references auth.users (id) on delete set null,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  budget_project_id uuid references app_theatre_budget.projects (id) on delete cascade,
  access_not_required boolean not null default false,
  budget_user_id uuid references app_theatre_budget.users (id) on delete set null,
  derived_access_scope_id uuid references app_theatre_budget.user_access_scopes (id) on delete set null,
  scope_managed boolean not null default false,
  status text not null default 'pending_account',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (access_role = 'viewer'),
  check (status in ('pending_account', 'granted', 'exempt')),
  check (
    (access_not_required and production_category_id is null and status = 'exempt')
    or
    (not access_not_required and production_category_id is not null and status <> 'exempt')
  )
);

alter table app_production_management.role_assignment_budget_access
  add column if not exists budget_project_id uuid references app_theatre_budget.projects (id) on delete cascade,
  add column if not exists access_not_required boolean not null default false,
  add column if not exists budget_user_id uuid references app_theatre_budget.users (id) on delete set null,
  add column if not exists derived_access_scope_id uuid references app_theatre_budget.user_access_scopes (id) on delete set null,
  add column if not exists scope_managed boolean not null default false,
  add column if not exists status text not null default 'pending_account';

alter table app_production_management.role_assignment_budget_access
  alter column production_category_id drop not null;

alter table app_production_management.role_assignment_budget_access
  drop constraint if exists role_assignment_budget_access_role_assignment_id_production_key;

create unique index if not exists uq_pm_assignment_budget_access_department
  on app_production_management.role_assignment_budget_access (
    role_assignment_id,
    coalesce(production_category_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists idx_pm_assignment_budget_access_assignment
  on app_production_management.role_assignment_budget_access (role_assignment_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'role_assignment_budget_access_status_check'
      and conrelid = 'app_production_management.role_assignment_budget_access'::regclass
  ) then
    alter table app_production_management.role_assignment_budget_access
      add constraint role_assignment_budget_access_status_check
      check (status in ('pending_account', 'granted', 'exempt'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'role_assignment_budget_access_semantics_check'
      and conrelid = 'app_production_management.role_assignment_budget_access'::regclass
  ) then
    alter table app_production_management.role_assignment_budget_access
      add constraint role_assignment_budget_access_semantics_check
      check (
        (access_not_required and production_category_id is null and status = 'exempt')
        or
        (not access_not_required and production_category_id is not null and status <> 'exempt')
      );
  end if;
end $$;

drop trigger if exists set_updated_at on app_production_management.role_assignment_budget_access;
create trigger set_updated_at
before update on app_production_management.role_assignment_budget_access
for each row execute function app_production_management.set_updated_at();

alter table app_production_management.role_assignment_budget_access enable row level security;

drop policy if exists "budget access read app staff"
  on app_production_management.role_assignment_budget_access;
create policy "budget access read app staff"
on app_production_management.role_assignment_budget_access
for select to authenticated
using (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']));

revoke all on app_production_management.role_assignment_budget_access from public, anon;
grant select on app_production_management.role_assignment_budget_access to authenticated;
grant select, insert, update, delete on app_production_management.role_assignment_budget_access to service_role;

-- The earlier Lighting Designer experiment granted project-wide visibility.
-- Department access is now explicit and can include one or several categories.
update app_production_management.integration_controls
set enabled = false,
    detail = 'Replaced by explicit multi-department viewer access managed from Production Management.',
    updated_at = now()
where integration_key = 'lighting_designer_budget_viewer';

drop trigger if exists phase5a_lighting_designer_budget_access
  on app_production_management.role_assignments;
drop trigger if exists phase5a_budget_project_link_reconciliation
  on app_production_management.external_links;

update app_theatre_budget.user_access_scopes scope
set active = false
where scope.id in (
  select team.derived_access_scope_id
  from app_theatre_budget.production_team_assignments team
  where team.source_app = 'production_management'
    and team.source_access_scope_managed
    and team.derived_access_scope_id is not null
);

update app_theatre_budget.production_team_assignments
set active = false,
    updated_at = now()
where source_app = 'production_management';

-- Preserve any exemptions selected while the earlier UI was live, then return
-- guest_artist_sync_status to its original payee-record meaning.
insert into app_production_management.role_assignment_budget_access (
  role_assignment_id,
  access_not_required,
  status
)
select assignment.id, true, 'exempt'
from app_production_management.role_assignments assignment
where assignment.is_guest_artist
  and assignment.guest_artist_sync_status = 'disabled'
on conflict do nothing;

update app_production_management.role_assignments assignment
set guest_artist_sync_status = case
  when exists (
    select 1
    from app_production_management.external_links link
    where link.local_entity_type = 'role_assignment'
      and link.local_entity_id = assignment.id
      and link.external_app = 'theatre_budget'
      and link.external_schema = 'app_theatre_budget'
      and link.external_table = 'guest_artists'
  ) then 'synced'
  else 'not_ready'
end
where assignment.is_guest_artist
  and assignment.guest_artist_sync_status = 'disabled';

create or replace function app_production_management.clear_assignment_department_budget_access(
  target_assignment_id uuid
)
returns void
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, public
as $$
declare
  old_record record;
begin
  for old_record in
    select access.derived_access_scope_id, access.scope_managed
    from app_production_management.role_assignment_budget_access access
    where access.role_assignment_id = target_assignment_id
  loop
    if old_record.scope_managed and old_record.derived_access_scope_id is not null
      and not exists (
        select 1
        from app_production_management.role_assignment_budget_access other_access
        where other_access.role_assignment_id <> target_assignment_id
          and other_access.derived_access_scope_id = old_record.derived_access_scope_id
          and other_access.status = 'granted'
      ) then
      update app_theatre_budget.user_access_scopes
      set active = false
      where id = old_record.derived_access_scope_id;
    end if;
  end loop;

  delete from app_production_management.role_assignment_budget_access
  where role_assignment_id = target_assignment_id;
end;
$$;

create or replace function app_production_management.set_assignment_department_budget_access(
  target_assignment_id uuid,
  target_category_ids uuid[],
  no_access_required boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, auth, public
as $$
declare
  assignment_record record;
  budget_project_id uuid;
  budget_user_id uuid;
  category_id uuid;
  scope_id uuid;
  scope_was_active boolean;
  scope_managed boolean;
  selected_count integer := 0;
  granted_count integer := 0;
begin
  select
    assignment.id,
    assignment.project_id,
    assignment.person_id,
    assignment.is_guest_artist,
    role.name as role_name,
    person.full_name,
    person.email,
    person.auth_user_id
  into assignment_record
  from app_production_management.role_assignments assignment
  join app_production_management.project_roles role on role.id = assignment.role_id
  join app_production_management.people person on person.id = assignment.person_id
  where assignment.id = target_assignment_id;

  if assignment_record.id is null or not assignment_record.is_guest_artist then
    raise exception 'Only guest artist assignments can receive Theatre Budget department access.';
  end if;

  perform app_production_management.clear_assignment_department_budget_access(target_assignment_id);

  if no_access_required then
    insert into app_production_management.role_assignment_budget_access (
      role_assignment_id, access_not_required, status
    ) values (
      target_assignment_id, true, 'exempt'
    );
    return jsonb_build_object('status', 'exempt', 'departments', 0, 'granted', 0);
  end if;

  select link.external_id::uuid
  into budget_project_id
  from app_production_management.external_links link
  where link.local_entity_type = 'project'
    and link.local_entity_id = assignment_record.project_id
    and link.external_app = 'theatre_budget'
    and link.external_schema = 'app_theatre_budget'
    and link.external_table = 'projects'
    and link.sync_status <> 'disabled'
  order by link.created_at desc
  limit 1;

  if budget_project_id is null then
    raise exception 'Link this production to its Theatre Budget project before assigning department access.';
  end if;

  if coalesce(array_length(target_category_ids, 1), 0) = 0 then
    raise exception 'Choose at least one department or mark Theatre Budget access as not required.';
  end if;

  budget_user_id := assignment_record.auth_user_id;
  if budget_user_id is null and nullif(trim(coalesce(assignment_record.email, '')), '') is not null then
    select auth_user.id
    into budget_user_id
    from auth.users auth_user
    where lower(auth_user.email) = lower(trim(assignment_record.email))
      and auth_user.deleted_at is null
    order by auth_user.created_at
    limit 1;
  end if;

  if budget_user_id is not null then
    insert into app_theatre_budget.users (id, full_name)
    values (budget_user_id, assignment_record.full_name)
    on conflict (id) do update
    set full_name = case
      when nullif(trim(coalesce(app_theatre_budget.users.full_name, '')), '') is null
        then excluded.full_name
      else app_theatre_budget.users.full_name
    end;
  end if;

  for category_id in
    select distinct unnest(target_category_ids)
  loop
    if not exists (
      select 1
      from app_theatre_budget.production_categories category
      where category.id = category_id
        and category.active
    ) then
      raise exception 'One of the selected Theatre Budget departments is unavailable.';
    end if;

    selected_count := selected_count + 1;
    scope_id := null;
    scope_was_active := false;
    scope_managed := false;

    if budget_user_id is not null then
      select scope.id, scope.active
      into scope_id, scope_was_active
      from app_theatre_budget.user_access_scopes scope
      where scope.user_id = budget_user_id
        and scope.scope_role = 'viewer'
        and scope.project_id = budget_project_id
        and scope.production_category_id = category_id
        and scope.fiscal_year_id is null
        and scope.organization_id is null
      order by scope.created_at
      limit 1;

      if scope_id is null then
        insert into app_theatre_budget.user_access_scopes (
          user_id,
          scope_role,
          project_id,
          production_category_id,
          fiscal_year_id,
          organization_id,
          active
        ) values (
          budget_user_id,
          'viewer',
          budget_project_id,
          category_id,
          null,
          null,
          true
        )
        returning id, active into scope_id, scope_was_active;
        scope_managed := true;
      else
        update app_theatre_budget.user_access_scopes
        set active = true
        where id = scope_id;
        scope_managed := not scope_was_active;
      end if;
      granted_count := granted_count + 1;
    end if;

    insert into app_production_management.role_assignment_budget_access (
      role_assignment_id,
      budget_project_id,
      production_category_id,
      access_not_required,
      budget_user_id,
      derived_access_scope_id,
      scope_managed,
      status
    ) values (
      target_assignment_id,
      budget_project_id,
      category_id,
      false,
      budget_user_id,
      scope_id,
      scope_managed,
      case when budget_user_id is null then 'pending_account' else 'granted' end
    );
  end loop;

  return jsonb_build_object(
    'status', case when budget_user_id is null then 'pending_account' else 'granted' end,
    'departments', selected_count,
    'granted', granted_count,
    'budget_project_id', budget_project_id,
    'budget_user_id', budget_user_id
  );
end;
$$;

create or replace function app_production_management.clear_department_budget_access_on_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, public
as $$
begin
  if tg_op = 'DELETE' then
    perform app_production_management.clear_assignment_department_budget_access(old.id);
    return old;
  end if;
  if old.person_id is distinct from new.person_id
    or (old.is_guest_artist and not new.is_guest_artist) then
    perform app_production_management.clear_assignment_department_budget_access(old.id);
  end if;
  return new;
end;
$$;

drop trigger if exists clear_department_budget_access_on_assignment_change
  on app_production_management.role_assignments;
create trigger clear_department_budget_access_on_assignment_change
before update of person_id, is_guest_artist or delete
on app_production_management.role_assignments
for each row execute function app_production_management.clear_department_budget_access_on_assignment_change();

do $$
declare
  access_record record;
begin
  for access_record in
    select
      access.role_assignment_id,
      array_agg(access.production_category_id order by access.production_category_id) as category_ids
    from app_production_management.role_assignment_budget_access access
    where access.active
      and not access.access_not_required
      and access.production_category_id is not null
    group by access.role_assignment_id
  loop
    begin
      perform app_production_management.set_assignment_department_budget_access(
        access_record.role_assignment_id,
        access_record.category_ids,
        false
      );
    exception when others then
      raise notice 'Existing department access for assignment % remains pending: %',
        access_record.role_assignment_id, sqlerrm;
    end;
  end loop;
end $$;

alter function app_production_management.clear_assignment_department_budget_access(uuid)
  owner to postgres;
alter function app_production_management.set_assignment_department_budget_access(uuid, uuid[], boolean)
  owner to postgres;
alter function app_production_management.clear_department_budget_access_on_assignment_change()
  owner to postgres;

grant usage on schema app_production_management, app_theatre_budget, auth to postgres;
grant select on
  app_production_management.role_assignments,
  app_production_management.project_roles,
  app_production_management.people,
  app_production_management.external_links,
  app_theatre_budget.projects,
  app_theatre_budget.production_categories
to postgres;
grant select, insert, update, delete on
  app_production_management.role_assignment_budget_access,
  app_theatre_budget.users,
  app_theatre_budget.user_access_scopes
to postgres;
grant select on auth.users to postgres;

revoke all on function app_production_management.set_assignment_department_budget_access(uuid, uuid[], boolean)
from public, anon, authenticated;
revoke all on function app_production_management.clear_assignment_department_budget_access(uuid)
from public, anon, authenticated;
revoke all on function app_production_management.clear_department_budget_access_on_assignment_change()
from public, anon, authenticated;
grant execute on function app_production_management.set_assignment_department_budget_access(uuid, uuid[], boolean)
to service_role;
grant execute on function app_production_management.clear_assignment_department_budget_access(uuid)
to service_role;

commit;
