begin;

-- A contributor may save formatted HTML, but approval is meaningful only when
-- that HTML contains visible text. Keep the database guard aligned with the
-- application and prevent a stale "bio not required" flag from producing a
-- misleading approval notification.
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
  clean_bio text := left(trim(coalesce(new_bio, '')), 12000);
  visible_bio text;
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

  visible_bio := btrim(regexp_replace(
    regexp_replace(replace(clean_bio, '&nbsp;', ' '), '<[^>]*>', ' ', 'gi'),
    '[[:space:]]+', ' ', 'g'
  ));

  update app_production_management.project_publicity_submissions
  set bio = clean_bio,
      bio_required = case when visible_bio <> '' then true else bio_required end,
      status = case when status in ('person_approved', 'approved') and visible_bio <> '' then 'person_approved' else 'draft' end,
      person_approved_at = case when status in ('person_approved', 'approved') and visible_bio <> '' then now() else null end,
      person_approved_by = case when status in ('person_approved', 'approved') and visible_bio <> '' then auth.uid() else null end,
      playbill_sync_status = case when status in ('person_approved', 'approved') and visible_bio <> '' then 'pending' else 'not_ready' end,
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
    and submission.bio_required
    and btrim(regexp_replace(
      regexp_replace(replace(coalesce(submission.bio, ''), '&nbsp;', ' '), '<[^>]*>', ' ', 'gi'),
      '[[:space:]]+', ' ', 'g'
    )) <> ''
    and submission.playbill_submission_status <> 'locked'
  returning submission.id into approved_id;

  if approved_id is null then
    raise exception 'Save a visible show-specific bio and restore the bio requirement before approving it.';
  end if;
  return approved_id;
end;
$$;

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
  set bio_required = new_bio_required,
      status = case when new_bio_required then status else 'draft' end,
      person_approved_at = case when new_bio_required then person_approved_at else null end,
      person_approved_by = case when new_bio_required then person_approved_by else null end,
      editorial_approved_at = case when new_bio_required then editorial_approved_at else null end,
      editorial_approved_by = case when new_bio_required then editorial_approved_by else null end,
      playbill_sync_status = case when new_bio_required then playbill_sync_status else 'not_ready' end,
      playbill_sync_error = case when new_bio_required then playbill_sync_error else '' end
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

grant execute on function app_production_management.update_my_project_publicity_bio(uuid, text) to authenticated;
grant execute on function app_production_management.approve_my_project_publicity(uuid) to authenticated;
grant execute on function app_production_management.set_my_project_publicity_requirement(uuid, boolean) to authenticated;

-- Repair only impossible approval states. Preserve all saved text, skipped
-- choices, and locked Playbill history.
update app_production_management.project_publicity_submissions
set status = 'draft',
    person_approved_at = null,
    person_approved_by = null,
    editorial_approved_at = null,
    editorial_approved_by = null,
    playbill_sync_status = 'not_ready',
    playbill_sync_error = 'Approval was reset because no visible production bio was saved.'
where status in ('person_approved', 'approved')
  and playbill_submission_status <> 'locked'
  and btrim(regexp_replace(
    regexp_replace(replace(coalesce(bio, ''), '&nbsp;', ' '), '<[^>]*>', ' ', 'gi'),
    '[[:space:]]+', ' ', 'g'
  )) = '';

update app_production_management.project_publicity_submissions
set status = 'draft',
    person_approved_at = null,
    person_approved_by = null,
    editorial_approved_at = null,
    editorial_approved_by = null,
    playbill_sync_status = 'not_ready',
    playbill_sync_error = ''
where bio_required = false
  and status in ('person_approved', 'approved')
  and playbill_submission_status <> 'locked';

commit;
