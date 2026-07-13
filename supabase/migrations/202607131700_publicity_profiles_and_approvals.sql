alter table app_production_management.people
  add column if not exists publicity_bio text not null default '',
  add column if not exists publicity_headshot_url text not null default '',
  add column if not exists publicity_profile_version integer not null default 1,
  add column if not exists publicity_profile_updated_at timestamptz;

create table if not exists app_production_management.project_publicity_submissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects (id) on delete cascade,
  person_id uuid not null references app_production_management.people (id) on delete cascade,
  credited_name text not null default '',
  bio text not null default '',
  headshot_url text not null default '',
  source_profile_version integer not null default 1,
  status text not null default 'draft',
  person_approved_at timestamptz,
  person_approved_by uuid references auth.users (id) on delete set null,
  editorial_approved_at timestamptz,
  editorial_approved_by uuid references auth.users (id) on delete set null,
  playbill_sync_status text not null default 'not_ready',
  playbill_sync_error text not null default '',
  playbill_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, person_id),
  check (status in ('draft', 'awaiting_person_approval', 'person_approved', 'changes_requested', 'approved')),
  check (playbill_sync_status in ('not_ready', 'pending', 'synced', 'failed', 'disabled'))
);

create index if not exists idx_pm_publicity_project_status
  on app_production_management.project_publicity_submissions (project_id, status);

create index if not exists idx_pm_publicity_person
  on app_production_management.project_publicity_submissions (person_id, project_id);

drop trigger if exists set_updated_at on app_production_management.project_publicity_submissions;
create trigger set_updated_at
before update on app_production_management.project_publicity_submissions
for each row execute function app_production_management.set_updated_at();

alter table app_production_management.project_publicity_submissions enable row level security;

drop policy if exists "publicity read project or owner" on app_production_management.project_publicity_submissions;
create policy "publicity read project or owner"
on app_production_management.project_publicity_submissions
for select to authenticated
using (
  app_production_management.is_project_member(project_id)
  or exists (
    select 1
    from app_production_management.people person
    where person.id = person_id
      and person.auth_user_id = auth.uid()
  )
);

drop policy if exists "publicity manage project staff" on app_production_management.project_publicity_submissions;
create policy "publicity manage project staff"
on app_production_management.project_publicity_submissions
for all to authenticated
using (
  app_production_management.has_app_role(array['admin', 'producer'])
  or app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head', 'staff']))
with check (
  app_production_management.has_app_role(array['admin', 'producer'])
  or app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head', 'staff']))
);

drop policy if exists "publicity owner approve" on app_production_management.project_publicity_submissions;
create policy "publicity owner approve"
on app_production_management.project_publicity_submissions
for update to authenticated
using (
  exists (
    select 1
    from app_production_management.people person
    where person.id = person_id
      and person.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from app_production_management.people person
    where person.id = person_id
      and person.auth_user_id = auth.uid()
  )
);

drop policy if exists "people read own profile" on app_production_management.people;
create policy "people read own profile" on app_production_management.people
for select to authenticated
using (auth_user_id = auth.uid());

drop policy if exists "people update own publicity profile" on app_production_management.people;
create policy "people update own publicity profile" on app_production_management.people
for update to authenticated
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

drop policy if exists "projects read assigned person" on app_production_management.projects;
create policy "projects read assigned person" on app_production_management.projects
for select to authenticated
using (
  exists (
    select 1
    from app_production_management.role_assignments assignment
    join app_production_management.people person on person.id = assignment.person_id
    where assignment.project_id = projects.id
      and person.auth_user_id = auth.uid()
  )
);

drop policy if exists "roles read assigned person" on app_production_management.project_roles;
create policy "roles read assigned person" on app_production_management.project_roles
for select to authenticated
using (
  exists (
    select 1
    from app_production_management.role_assignments assignment
    join app_production_management.people person on person.id = assignment.person_id
    where assignment.role_id = project_roles.id
      and person.auth_user_id = auth.uid()
  )
);

drop policy if exists "assignments read assigned person" on app_production_management.role_assignments;
create policy "assignments read assigned person" on app_production_management.role_assignments
for select to authenticated
using (
  exists (
    select 1
    from app_production_management.people person
    where person.id = role_assignments.person_id
      and person.auth_user_id = auth.uid()
  )
);

grant select, insert, update, delete on app_production_management.project_publicity_submissions to authenticated;

create or replace function app_production_management.claim_my_person_profile()
returns uuid
language plpgsql
security definer
set search_path = app_production_management, auth, public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  display_name text := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() -> 'user_metadata' ->> 'name',
    split_part(current_email, '@', 1)
  );
  profile_id uuid;
begin
  if current_user_id is null or current_email = '' then
    raise exception 'A signed-in user with an email address is required.';
  end if;

  select id into profile_id
  from app_production_management.people
  where auth_user_id = current_user_id
  limit 1;

  if profile_id is not null then
    return profile_id;
  end if;

  select id into profile_id
  from app_production_management.people
  where lower(email) = current_email
  order by created_at
  limit 1
  for update;

  if profile_id is null then
    insert into app_production_management.people (auth_user_id, full_name, email)
    values (current_user_id, display_name, current_email)
    returning id into profile_id;
  else
    update app_production_management.people
    set auth_user_id = current_user_id
    where id = profile_id
      and auth_user_id is null;

    if not found then
      raise exception 'This email is already connected to another sign-in.';
    end if;
  end if;

  return profile_id;
end;
$$;

grant execute on function app_production_management.claim_my_person_profile() to authenticated;

comment on table app_production_management.project_publicity_submissions is
  'Frozen, production-specific publicity copy. Playbill receives only an approved snapshot, never a live profile.';
