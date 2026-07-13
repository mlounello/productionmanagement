begin;

-- Formatted biographies contain safe HTML tags, so raw database length is not
-- the same as the contributor-visible character count. The application counts
-- visible text at 350 characters and sanitizes HTML before calling this RPC.
alter table app_production_management.people
  drop constraint if exists people_publicity_bio_350_chars;

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
declare profile_id uuid;
declare clean_bio text := left(trim(coalesce(new_publicity_bio, '')), 5000);
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if nullif(trim(new_full_name), '') is null then raise exception 'Full name is required.'; end if;
  select id into profile_id from app_production_management.people where auth_user_id = auth.uid() limit 1 for update;
  if profile_id is null then raise exception 'Your person profile is not connected.'; end if;
  update app_production_management.people
  set full_name = left(trim(new_full_name), 180), first_name = left(trim(coalesce(new_first_name, '')), 80),
      middle_name = left(trim(coalesce(new_middle_name, '')), 80), last_name = left(trim(coalesce(new_last_name, '')), 80),
      preferred_name = left(trim(coalesce(new_preferred_name, '')), 120), pronouns = left(trim(coalesce(new_pronouns, '')), 80),
      vendor_number = left(trim(coalesce(new_vendor_number, '')), 40), phone = left(trim(coalesce(new_phone, '')), 40),
      publicity_bio = clean_bio,
      publicity_profile_version = publicity_profile_version + case when publicity_bio is distinct from clean_bio then 1 else 0 end,
      publicity_profile_updated_at = case when publicity_bio is distinct from clean_bio then now() else publicity_profile_updated_at end
  where id = profile_id;
  return profile_id;
end;
$$;

grant execute on function app_production_management.update_my_person_profile(text, text, text, text, text, text, text, text, text) to authenticated;

commit;
