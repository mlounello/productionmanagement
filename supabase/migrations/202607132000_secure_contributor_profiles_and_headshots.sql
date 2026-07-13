alter table app_production_management.people
  add column if not exists middle_name text not null default '',
  add column if not exists profile_headshot_updated_at timestamptz;

create table if not exists app_production_management.person_management_details (
  person_id uuid primary key references app_production_management.people (id) on delete cascade,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

insert into app_production_management.person_management_details (person_id, notes)
select id, notes
from app_production_management.people
where notes <> ''
on conflict (person_id) do update
set notes = case
  when app_production_management.person_management_details.notes = '' then excluded.notes
  else app_production_management.person_management_details.notes
end;

-- The legacy column shares the contributor-readable people row. Keep it empty;
-- all management-only profile notes live behind the staff-only table above.
update app_production_management.people set notes = '' where notes <> '';

alter table app_production_management.person_management_details enable row level security;
drop policy if exists "management details staff only" on app_production_management.person_management_details;
create policy "management details staff only"
on app_production_management.person_management_details
for all to authenticated
using (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']))
with check (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']));

grant select, insert, update, delete on app_production_management.person_management_details to authenticated;

-- Contributors use narrow functions for profile changes. They must not be able to
-- update staff-only columns by bypassing the application UI.
drop policy if exists "people update own publicity profile" on app_production_management.people;

create or replace function app_production_management.update_my_person_profile(
  new_full_name text,
  new_first_name text,
  new_middle_name text,
  new_last_name text,
  new_preferred_name text,
  new_pronouns text,
  new_vendor_number text,
  new_phone text,
  new_publicity_bio text
)
returns uuid
language plpgsql
security definer
set search_path = app_production_management, auth, public
as $$
declare
  profile_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if nullif(trim(new_full_name), '') is null then
    raise exception 'Full name is required.';
  end if;

  select id into profile_id
  from app_production_management.people
  where auth_user_id = auth.uid()
  limit 1
  for update;

  if profile_id is null then
    raise exception 'Your person profile is not connected.';
  end if;

  update app_production_management.people
  set full_name = left(trim(new_full_name), 180),
      first_name = left(trim(coalesce(new_first_name, '')), 80),
      middle_name = left(trim(coalesce(new_middle_name, '')), 80),
      last_name = left(trim(coalesce(new_last_name, '')), 80),
      preferred_name = left(trim(coalesce(new_preferred_name, '')), 120),
      pronouns = left(trim(coalesce(new_pronouns, '')), 80),
      vendor_number = left(trim(coalesce(new_vendor_number, '')), 40),
      phone = left(trim(coalesce(new_phone, '')), 40),
      publicity_bio = left(trim(coalesce(new_publicity_bio, '')), 12000),
      publicity_profile_version = publicity_profile_version
        + case when publicity_bio is distinct from left(trim(coalesce(new_publicity_bio, '')), 12000) then 1 else 0 end,
      publicity_profile_updated_at = case
        when publicity_bio is distinct from left(trim(coalesce(new_publicity_bio, '')), 12000) then now()
        else publicity_profile_updated_at
      end
  where id = profile_id;

  return profile_id;
end;
$$;

create or replace function app_production_management.sync_my_person_email()
returns uuid
language plpgsql
security definer
set search_path = app_production_management, auth, public
as $$
declare
  profile_id uuid;
  verified_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if auth.uid() is null or verified_email = '' then
    raise exception 'A verified signed-in email is required.';
  end if;

  update app_production_management.people
  set email = verified_email
  where auth_user_id = auth.uid()
  returning id into profile_id;

  if profile_id is null then
    raise exception 'Your person profile is not connected.';
  end if;

  return profile_id;
exception
  when unique_violation then
    raise exception 'That email is already connected to another person profile.';
end;
$$;

create or replace function app_production_management.set_person_headshot(
  target_person_id uuid,
  new_headshot_url text
)
returns uuid
language plpgsql
security definer
set search_path = app_production_management, auth, public
as $$
declare
  is_owner boolean;
begin
  select auth_user_id = auth.uid() into is_owner
  from app_production_management.people
  where id = target_person_id;

  if not coalesce(is_owner, false)
     and not app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']) then
    raise exception 'You do not have permission to update this headshot.';
  end if;

  update app_production_management.people
  set publicity_headshot_url = trim(coalesce(new_headshot_url, '')),
      publicity_profile_version = publicity_profile_version
        + case when publicity_headshot_url is distinct from trim(coalesce(new_headshot_url, '')) then 1 else 0 end,
      publicity_profile_updated_at = case
        when publicity_headshot_url is distinct from trim(coalesce(new_headshot_url, '')) then now()
        else publicity_profile_updated_at
      end,
      profile_headshot_updated_at = now()
  where id = target_person_id;

  if not found then
    raise exception 'Person profile not found.';
  end if;

  return target_person_id;
end;
$$;

grant execute on function app_production_management.update_my_person_profile(text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function app_production_management.sync_my_person_email() to authenticated;
grant execute on function app_production_management.set_person_headshot(uuid, text) to authenticated;

drop policy if exists "accomplishments read own profile" on app_production_management.profile_accomplishments;
create policy "accomplishments read own profile"
on app_production_management.profile_accomplishments
for select to authenticated
using (
  exists (
    select 1 from app_production_management.people person
    where person.id = person_id and person.auth_user_id = auth.uid()
  )
);

drop policy if exists "person notes read own client visible" on app_production_management.person_notes;
create policy "person notes read own client visible"
on app_production_management.person_notes
for select to authenticated
using (
  visibility = 'client_visible'
  and exists (
    select 1 from app_production_management.people person
    where person.id = person_id and person.auth_user_id = auth.uid()
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-headshots',
  'profile-headshots',
  true,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile headshots insert permitted" on storage.objects;
create policy "profile headshots insert permitted"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-headshots'
  and exists (
    select 1
    from app_production_management.people person
    where person.id::text = (storage.foldername(name))[1]
      and (
        person.auth_user_id = auth.uid()
        or app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty'])
      )
  )
);

drop policy if exists "profile headshots select permitted" on storage.objects;
create policy "profile headshots select permitted"
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-headshots'
  and exists (
    select 1
    from app_production_management.people person
    where person.id::text = (storage.foldername(name))[1]
      and (
        person.auth_user_id = auth.uid()
        or app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty'])
      )
  )
);

drop policy if exists "profile headshots update permitted" on storage.objects;
create policy "profile headshots update permitted"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-headshots'
  and exists (
    select 1
    from app_production_management.people person
    where person.id::text = (storage.foldername(name))[1]
      and (
        person.auth_user_id = auth.uid()
        or app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty'])
      )
  )
)
with check (
  bucket_id = 'profile-headshots'
  and exists (
    select 1
    from app_production_management.people person
    where person.id::text = (storage.foldername(name))[1]
      and (
        person.auth_user_id = auth.uid()
        or app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty'])
      )
  )
);

drop policy if exists "profile headshots delete permitted" on storage.objects;
create policy "profile headshots delete permitted"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-headshots'
  and exists (
    select 1
    from app_production_management.people person
    where person.id::text = (storage.foldername(name))[1]
      and (
        person.auth_user_id = auth.uid()
        or app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty'])
      )
  )
);

comment on function app_production_management.set_person_headshot(uuid, text) is
  'Records the public URL for a reusable, square headshot after the upload route has compressed it to 3 MB or less.';

comment on table app_production_management.person_management_details is
  'Staff-only profile details. Contributors cannot select this table; client-visible notes use person_notes instead.';
