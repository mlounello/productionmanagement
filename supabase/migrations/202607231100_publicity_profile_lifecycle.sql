begin;

-- Saving a reusable profile bio should make an empty production copy useful
-- immediately, without overwriting a bio that was already customized for a
-- particular show.
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
  clean_bio text := left(trim(coalesce(new_publicity_bio, '')), 5000);
  new_profile_version integer;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if nullif(trim(new_full_name), '') is null then raise exception 'Full name is required.'; end if;

  select id
  into profile_id
  from app_production_management.people
  where auth_user_id = auth.uid()
  limit 1
  for update;

  if profile_id is null then raise exception 'Your person profile is not connected.'; end if;

  update app_production_management.people
  set full_name = left(trim(new_full_name), 180),
      first_name = left(trim(coalesce(new_first_name, '')), 80),
      middle_name = left(trim(coalesce(new_middle_name, '')), 80),
      last_name = left(trim(coalesce(new_last_name, '')), 80),
      preferred_name = left(trim(coalesce(new_preferred_name, '')), 120),
      pronouns = left(trim(coalesce(new_pronouns, '')), 80),
      vendor_number = left(trim(coalesce(new_vendor_number, '')), 40),
      phone = left(trim(coalesce(new_phone, '')), 40),
      publicity_bio = clean_bio,
      publicity_profile_version = publicity_profile_version + case when publicity_bio is distinct from clean_bio then 1 else 0 end,
      publicity_profile_updated_at = case when publicity_bio is distinct from clean_bio then now() else publicity_profile_updated_at end
  where id = profile_id
  returning publicity_profile_version into new_profile_version;

  if clean_bio <> '' then
    update app_production_management.project_publicity_submissions
    set bio = clean_bio,
        source_profile_version = new_profile_version,
        status = 'draft',
        person_approved_at = null,
        person_approved_by = null,
        editorial_approved_at = null,
        editorial_approved_by = null,
        playbill_sync_status = 'not_ready',
        playbill_sync_error = ''
    where person_id = profile_id
      and bio_required
      and trim(coalesce(bio, '')) = ''
      and playbill_submission_status <> 'locked';
  end if;

  return profile_id;
end;
$$;

grant execute on function app_production_management.update_my_person_profile(text, text, text, text, text, text, text, text, text) to authenticated;

-- A contributor can opt a single, unlocked production out of publicity from
-- their own secure profile. The function cannot alter another person's record
-- or any final copy already locked by Playbill.
create or replace function app_production_management.set_my_project_publicity_requirement(
  target_submission_id uuid,
  new_bio_required boolean
)
returns boolean
language plpgsql
security definer
set search_path = app_production_management, auth, public
as $$
declare
  changed boolean;
begin
  update app_production_management.project_publicity_submissions submission
  set bio_required = new_bio_required
  from app_production_management.people person
  where submission.id = target_submission_id
    and person.id = submission.person_id
    and person.auth_user_id = auth.uid()
    and submission.playbill_submission_status <> 'locked'
  returning true into changed;

  if changed is not true then
    raise exception 'This production publicity requirement cannot be changed.';
  end if;
  return true;
end;
$$;

grant execute on function app_production_management.set_my_project_publicity_requirement(uuid, boolean) to authenticated;

commit;
