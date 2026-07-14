begin;

-- Give the application a read-only preflight through the same narrow
-- privilege boundary used for the actual cross-app write.
create or replace function app_production_management.get_publicity_playbill_sync_state(
  target_submission_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = app_production_management, app_playbill, public
as $$
declare
  submission_project_id uuid;
  playbill_show_id text;
  playbill_show_status text;
  playbill_show_is_published boolean;
begin
  select submission.project_id into submission_project_id
  from app_production_management.project_publicity_submissions submission
  where submission.id = target_submission_id;

  if submission_project_id is null then
    raise exception 'Publicity submission not found.';
  end if;

  select link.external_id into playbill_show_id
  from app_production_management.external_links link
  where link.local_entity_type = 'project'
    and link.local_entity_id = submission_project_id
    and link.external_app = 'playbill'
    and link.external_schema = 'app_playbill'
    and link.external_table = 'shows'
  order by link.created_at desc
  limit 1;

  if nullif(playbill_show_id, '') is null then
    return jsonb_build_object('show_id', null, 'status', null, 'is_published', null);
  end if;

  select show_record.status::text, show_record.is_published
  into playbill_show_status, playbill_show_is_published
  from app_playbill.shows show_record
  where show_record.id::text = playbill_show_id;

  if playbill_show_status is null then
    raise exception 'The linked Playbill show was not found.';
  end if;

  return jsonb_build_object(
    'show_id', playbill_show_id,
    'status', playbill_show_status,
    'is_published', playbill_show_is_published
  );
end;
$$;

-- Recheck draft/published state inside the write transaction. FOR SHARE keeps
-- the show from being published between this check and the publicity update.
create or replace function app_production_management.push_publicity_to_playbill(
  target_submission_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = app_production_management, app_playbill, public
as $$
declare
  submission app_production_management.project_publicity_submissions%rowtype;
  playbill_show_id text;
  playbill_show_status text;
  playbill_show_is_published boolean;
  playbill_person_id text;
  playbill_person_status text;
  request_ids text[];
  synced_at timestamptz := now();
begin
  select * into submission
  from app_production_management.project_publicity_submissions
  where id = target_submission_id
  for update;

  if submission.id is null then raise exception 'Publicity submission not found.'; end if;
  if submission.status not in ('person_approved', 'approved') then
    raise exception 'The person must approve this production copy before it can be sent to Playbill.';
  end if;

  select external_id into playbill_show_id
  from app_production_management.external_links
  where local_entity_type = 'project'
    and local_entity_id = submission.project_id
    and external_app = 'playbill'
    and external_schema = 'app_playbill'
    and external_table = 'shows'
  order by created_at desc
  limit 1;
  if nullif(playbill_show_id, '') is null then raise exception 'This project is not linked to a Playbill show.'; end if;

  select show_record.status::text, show_record.is_published
  into playbill_show_status, playbill_show_is_published
  from app_playbill.shows show_record
  where show_record.id::text = playbill_show_id
  for share;

  if playbill_show_status is null then raise exception 'The linked Playbill show was not found.'; end if;
  if playbill_show_is_published then raise exception 'The linked Playbill show is published and read-only.'; end if;
  if playbill_show_status <> 'draft' then raise exception 'The linked Playbill show is not a draft and cannot be changed.'; end if;

  select external_id into playbill_person_id
  from app_production_management.external_links
  where local_entity_type = 'person'
    and local_entity_id = submission.person_id
    and external_app = 'playbill'
    and external_schema = 'app_playbill'
    and external_table = 'people'
    and coalesce(metadata ->> 'show_id', '') = playbill_show_id
  order by created_at desc
  limit 1;
  if nullif(playbill_person_id, '') is null then
    raise exception 'Sync the role assignment to Playbill before sending its publicity copy.';
  end if;

  select person.submission_status into playbill_person_status
  from app_playbill.people person
  where person.id::text = playbill_person_id;
  if playbill_person_status is null then raise exception 'The linked Playbill person was not found.'; end if;
  if playbill_person_status = 'locked' then raise exception 'This Playbill submission is locked and cannot be changed.'; end if;

  select array_agg(link.external_id order by link.created_at)
  into request_ids
  from app_production_management.external_links link
  where link.local_entity_type = 'role_assignment'
    and link.local_entity_id in (
      select assignment.id
      from app_production_management.role_assignments assignment
      where assignment.project_id = submission.project_id
        and assignment.person_id = submission.person_id
        and assignment.status not in ('declined', 'withdrawn')
    )
    and link.external_app = 'playbill'
    and link.external_schema = 'app_playbill'
    and link.external_table = 'submission_requests';
  if coalesce(array_length(request_ids, 1), 0) = 0 then
    raise exception 'The linked Playbill bio request was not found. Resync the role assignment first.';
  end if;

  update app_playbill.people person
  set full_name = submission.credited_name,
      bio = submission.bio,
      headshot_url = submission.headshot_url,
      submission_status = 'submitted',
      submitted_at = synced_at,
      submission_source = 'production_management',
      production_management_person_id = submission.person_id,
      production_management_approval_id = submission.id,
      source_profile_version = submission.source_profile_version
  where person.id::text = playbill_person_id
    and person.submission_status <> 'locked';

  update app_playbill.submission_requests request
  set status = 'submitted',
      submission_source = 'production_management'
  where request.id::text = any(request_ids)
    and request.request_type = 'bio'
    and request.status <> 'locked';

  update app_production_management.project_publicity_submissions
  set playbill_sync_status = 'synced',
      playbill_sync_error = '',
      playbill_synced_at = synced_at,
      playbill_submission_status = 'submitted',
      playbill_last_reconciled_at = synced_at
  where id = submission.id;

  insert into app_production_management.audit_log (
    entity_type, entity_id, action, after_value, reason
  ) values (
    'project_publicity_submission', submission.id, 'playbill_publicity_synced',
    jsonb_build_object('playbill_show_id', playbill_show_id, 'playbill_person_id', playbill_person_id, 'submission_request_ids', request_ids, 'synced_at', synced_at),
    'Person-approved production publicity snapshot sent to a draft Playbill for editorial review.'
  );

  return jsonb_build_object(
    'playbill_show_id', playbill_show_id,
    'playbill_person_id', playbill_person_id,
    'submission_request_ids', request_ids,
    'synced_at', synced_at
  );
end;
$$;

alter function app_production_management.get_publicity_playbill_sync_state(uuid) owner to postgres;
alter function app_production_management.push_publicity_to_playbill(uuid) owner to postgres;

grant usage on schema app_production_management, app_playbill to postgres;
grant select on app_playbill.shows to postgres;

revoke all on function app_production_management.get_publicity_playbill_sync_state(uuid) from public, anon, authenticated;
grant execute on function app_production_management.get_publicity_playbill_sync_state(uuid) to service_role;
revoke all on function app_production_management.push_publicity_to_playbill(uuid) from public, anon, authenticated;
grant execute on function app_production_management.push_publicity_to_playbill(uuid) to service_role;

commit;
