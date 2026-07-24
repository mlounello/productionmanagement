begin;

-- A show copy that is still identical to the person's previous reusable bio is
-- inherited, not customized. Keep those copies tracking profile edits while
-- preserving any show copy whose text or formatting has genuinely diverged.
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
  previous_bio text;
  clean_bio text := left(trim(coalesce(new_publicity_bio, '')), 5000);
  new_profile_version integer;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if nullif(trim(new_full_name), '') is null then raise exception 'Full name is required.'; end if;

  select id, publicity_bio
  into profile_id, previous_bio
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

  if clean_bio <> '' and clean_bio is distinct from previous_bio then
    update app_production_management.project_publicity_submissions
    set bio = clean_bio,
        source_profile_version = new_profile_version,
        status = case when status in ('person_approved', 'approved') then 'person_approved' else 'draft' end,
        person_approved_at = case when status in ('person_approved', 'approved') then now() else null end,
        person_approved_by = case when status in ('person_approved', 'approved') then auth.uid() else null end,
        editorial_approved_at = null,
        editorial_approved_by = null,
        playbill_sync_status = case when status in ('person_approved', 'approved') then 'pending' else 'not_ready' end,
        playbill_sync_error = ''
    where person_id = profile_id
      and bio_required
      and playbill_submission_status <> 'locked'
      and (
        trim(coalesce(bio, '')) = ''
        or bio = previous_bio
      );
  end if;

  return profile_id;
end;
$$;

grant execute on function app_production_management.update_my_person_profile(
  text, text, text, text, text, text, text, text, text
) to authenticated;

commit;
