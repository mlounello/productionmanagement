begin;

-- The reusable profile is intentionally short. Existing longer biographies are
-- not destroyed; the application and profile RPC enforce the limit on edits.
alter table app_production_management.people
  drop constraint if exists people_publicity_bio_350_chars;
alter table app_production_management.people
  add constraint people_publicity_bio_350_chars
  check (char_length(publicity_bio) <= 350) not valid;

alter table app_production_management.project_publicity_submissions
  add column if not exists playbill_submission_status text not null default 'pending',
  add column if not exists playbill_locked_at timestamptz,
  add column if not exists playbill_last_reconciled_at timestamptz,
  add column if not exists last_reminder_sent_at timestamptz,
  add column if not exists reminder_count integer not null default 0;

alter table app_production_management.project_publicity_submissions
  drop constraint if exists project_publicity_playbill_submission_status_check;
alter table app_production_management.project_publicity_submissions
  add constraint project_publicity_playbill_submission_status_check
  check (playbill_submission_status in ('pending', 'draft', 'submitted', 'returned', 'approved', 'locked'));

create table if not exists app_production_management.project_publicity_settings (
  project_id uuid primary key references app_production_management.projects (id) on delete cascade,
  bio_due_on date,
  headshot_due_on date,
  reminders_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on app_production_management.project_publicity_settings;
create trigger set_updated_at before update on app_production_management.project_publicity_settings
for each row execute function app_production_management.set_updated_at();

alter table app_production_management.project_publicity_settings enable row level security;
drop policy if exists "publicity settings project staff" on app_production_management.project_publicity_settings;
create policy "publicity settings project staff"
on app_production_management.project_publicity_settings for all to authenticated
using (
  app_production_management.has_app_role(array['admin', 'producer'])
  or app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head', 'staff'])
)
with check (
  app_production_management.has_app_role(array['admin', 'producer'])
  or app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head', 'staff'])
);

drop policy if exists "publicity settings assigned person read" on app_production_management.project_publicity_settings;
create policy "publicity settings assigned person read"
on app_production_management.project_publicity_settings for select to authenticated
using (app_production_management.is_project_member(project_id));

grant select, insert, update, delete on app_production_management.project_publicity_settings to authenticated;

-- Contributors may no longer update an entire publicity row through the API.
-- These narrow functions expose only the production bio and approval actions.
drop policy if exists "publicity owner approve" on app_production_management.project_publicity_submissions;

create or replace function app_production_management.update_my_project_publicity_bio(
  target_submission_id uuid,
  new_bio text
)
returns text
language plpgsql
security definer
set search_path = app_production_management, auth, public
as $$
declare
  current_status text;
begin
  select submission.playbill_submission_status
  into current_status
  from app_production_management.project_publicity_submissions submission
  join app_production_management.people person on person.id = submission.person_id
  where submission.id = target_submission_id
    and person.auth_user_id = auth.uid()
  for update of submission;

  if current_status is null then raise exception 'Production publicity record not found.'; end if;
  if current_status = 'locked' then raise exception 'This Playbill submission is locked and is now historical.'; end if;

  update app_production_management.project_publicity_submissions
  set bio = left(trim(coalesce(new_bio, '')), 12000),
      status = case when status in ('person_approved', 'approved') then 'person_approved' else 'draft' end,
      playbill_sync_status = case when status in ('person_approved', 'approved') then 'pending' else 'not_ready' end,
      playbill_sync_error = '',
      editorial_approved_at = null,
      editorial_approved_by = null
  where id = target_submission_id;

  return current_status;
end;
$$;

create or replace function app_production_management.approve_my_project_publicity(
  target_submission_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = app_production_management, auth, public
as $$
declare
  approved_id uuid;
begin
  update app_production_management.project_publicity_submissions submission
  set status = 'person_approved',
      person_approved_at = now(),
      person_approved_by = auth.uid(),
      editorial_approved_at = null,
      editorial_approved_by = null,
      playbill_sync_status = 'pending',
      playbill_sync_error = ''
  from app_production_management.people person
  where submission.id = target_submission_id
    and person.id = submission.person_id
    and person.auth_user_id = auth.uid()
    and submission.playbill_submission_status <> 'locked'
  returning submission.id into approved_id;

  if approved_id is null then raise exception 'This submission cannot be approved.'; end if;
  return approved_id;
end;
$$;

grant execute on function app_production_management.update_my_project_publicity_bio(uuid, text) to authenticated;
grant execute on function app_production_management.approve_my_project_publicity(uuid) to authenticated;

-- Keep PM's project copy and Playbill's editorial state synchronized for every
-- Playbill writer (staff review, bulk actions, contributor edits, or PM import).
create or replace function app_production_management.receive_playbill_publicity_change()
returns trigger
language plpgsql
security definer
set search_path = app_production_management, app_playbill, public
as $$
begin
  if new.production_management_approval_id is null then return new; end if;

  update app_production_management.project_publicity_submissions
  set credited_name = coalesce(nullif(trim(new.full_name), ''), credited_name),
      bio = coalesce(new.bio, ''),
      headshot_url = coalesce(new.headshot_url, ''),
      playbill_submission_status = case
        when new.submission_status in ('pending', 'draft', 'submitted', 'returned', 'approved', 'locked')
          then new.submission_status
        else playbill_submission_status
      end,
      status = case
        when new.submission_status = 'returned' then 'changes_requested'
        when new.submission_status in ('approved', 'locked') then 'approved'
        when new.submission_status = 'submitted' then 'person_approved'
        else status
      end,
      editorial_approved_at = case
        when new.submission_status in ('approved', 'locked') then coalesce(editorial_approved_at, now())
        when new.submission_status in ('submitted', 'returned', 'draft', 'pending') then null
        else editorial_approved_at
      end,
      playbill_sync_status = 'synced',
      playbill_sync_error = '',
      playbill_synced_at = now(),
      playbill_last_reconciled_at = now(),
      playbill_locked_at = case when new.submission_status = 'locked' then coalesce(playbill_locked_at, now()) else null end
  where id = new.production_management_approval_id;
  return new;
end;
$$;

do $$
begin
  if to_regclass('app_playbill.people') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'app_playbill' and table_name = 'people'
         and column_name = 'production_management_approval_id'
     ) then
    execute 'drop trigger if exists sync_publicity_to_production_management on app_playbill.people';
    execute 'create trigger sync_publicity_to_production_management after insert or update of full_name, bio, headshot_url, submission_status, production_management_approval_id on app_playbill.people for each row execute function app_production_management.receive_playbill_publicity_change()';
    execute $sync$
      update app_production_management.project_publicity_submissions submission
      set credited_name = coalesce(nullif(trim(person.full_name), ''), submission.credited_name),
          bio = coalesce(person.bio, ''),
          headshot_url = coalesce(person.headshot_url, ''),
          playbill_submission_status = case when person.submission_status in ('pending', 'draft', 'submitted', 'returned', 'approved', 'locked') then person.submission_status else 'pending' end,
          playbill_sync_status = 'synced',
          playbill_sync_error = '',
          playbill_last_reconciled_at = now(),
          playbill_locked_at = case when person.submission_status = 'locked' then coalesce(submission.playbill_locked_at, now()) else null end
      from app_playbill.people person
      where person.production_management_approval_id = submission.id
    $sync$;
  end if;
end $$;

-- Replace the older 12,000-character reusable-profile implementation.
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
declare clean_bio text := left(trim(coalesce(new_publicity_bio, '')), 350);
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

commit;
