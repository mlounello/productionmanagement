begin;

-- Assignment sync updates Playbill identity fields before publicity is pushed.
-- Do not treat a name/email-only update as a Playbill publicity edit and copy
-- the older Playbill bio back over Production Management's newer source copy.
create or replace function app_production_management.receive_playbill_publicity_change()
returns trigger
language plpgsql
security definer
set search_path = app_production_management, app_playbill, public
as $$
begin
  if new.production_management_approval_id is null then return new; end if;
  if tg_op = 'UPDATE'
    and new.bio is not distinct from old.bio
    and new.headshot_url is not distinct from old.headshot_url
    and new.submission_status is not distinct from old.submission_status
    and new.production_management_approval_id is not distinct from old.production_management_approval_id
    and new.source_profile_version is not distinct from old.source_profile_version
  then
    return new;
  end if;

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

create or replace function app_playbill.enqueue_production_management_publicity_change()
returns trigger
language plpgsql
security definer
set search_path = app_playbill, core, public
as $$
declare
  event_payload jsonb;
  event_fingerprint text;
begin
  if new.production_management_approval_id is null then return new; end if;
  if tg_op = 'UPDATE'
    and new.bio is not distinct from old.bio
    and new.headshot_url is not distinct from old.headshot_url
    and new.submission_status is not distinct from old.submission_status
    and new.production_management_approval_id is not distinct from old.production_management_approval_id
    and new.source_profile_version is not distinct from old.source_profile_version
  then
    return new;
  end if;

  event_payload := jsonb_build_object(
    'playbill_person_id', new.id,
    'production_management_approval_id', new.production_management_approval_id,
    'full_name', new.full_name,
    'bio', new.bio,
    'headshot_url', new.headshot_url,
    'submission_status', new.submission_status,
    'source_profile_version', new.source_profile_version
  );
  event_fingerprint := encode(extensions.digest(event_payload::text, 'sha256'), 'hex');

  perform core.enqueue_integration_event(
    'playbill',
    'production_management',
    'playbill.publicity.changed',
    'person',
    new.id,
    event_payload,
    format('publicity:%s:%s', new.id, event_fingerprint)
  );
  return new;
end;
$$;

commit;
