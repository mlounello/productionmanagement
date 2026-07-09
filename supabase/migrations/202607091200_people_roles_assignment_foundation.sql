alter table app_production_management.role_assignments
  add column if not exists is_guest_artist boolean not null default false,
  add column if not exists playbill_sync_status text not null default 'not_ready',
  add column if not exists guest_artist_sync_status text not null default 'not_ready',
  add column if not exists sync_notes text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'role_assignments_playbill_sync_status_check'
      and conrelid = 'app_production_management.role_assignments'::regclass
  ) then
    alter table app_production_management.role_assignments
      add constraint role_assignments_playbill_sync_status_check
      check (playbill_sync_status in ('not_ready', 'pending', 'synced', 'failed', 'disabled'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'role_assignments_guest_artist_sync_status_check'
      and conrelid = 'app_production_management.role_assignments'::regclass
  ) then
    alter table app_production_management.role_assignments
      add constraint role_assignments_guest_artist_sync_status_check
      check (guest_artist_sync_status in ('not_guest_artist', 'not_ready', 'pending', 'synced', 'failed', 'disabled'));
  end if;
end $$;

update app_production_management.role_assignments
set guest_artist_sync_status = 'not_guest_artist'
where is_guest_artist = false
  and guest_artist_sync_status = 'not_ready';

create table if not exists app_production_management.person_notes (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references app_production_management.people (id) on delete cascade,
  project_id uuid references app_production_management.projects (id) on delete set null,
  visibility text not null default 'internal',
  note text not null,
  is_pinned boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (visibility in ('internal', 'client_visible'))
);

create index if not exists idx_pm_person_notes_person
  on app_production_management.person_notes (person_id, created_at desc);

create index if not exists idx_pm_person_notes_project
  on app_production_management.person_notes (project_id, created_at desc);

drop trigger if exists set_updated_at on app_production_management.person_notes;
create trigger set_updated_at
before update on app_production_management.person_notes
for each row execute function app_production_management.set_updated_at();

alter table app_production_management.person_notes enable row level security;

drop policy if exists "person notes read app members" on app_production_management.person_notes;
create policy "person notes read app members" on app_production_management.person_notes
for select to authenticated
using (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']));

drop policy if exists "person notes manage staff" on app_production_management.person_notes;
create policy "person notes manage staff" on app_production_management.person_notes
for all to authenticated
using (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']))
with check (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']));
