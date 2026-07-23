begin;

-- Phase 8 is intentionally additive. Existing cross-app functions and the
-- audition file_data fallback stay available through the Preview soak.

create table if not exists core.integration_outbox (
  id uuid primary key default gen_random_uuid(),
  source_app text not null,
  destination_app text not null,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  processed_at timestamptz,
  last_error text not null default '',
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_outbox_status_check
    check (status in ('pending', 'processing', 'succeeded', 'failed', 'dead_letter')),
  constraint integration_outbox_attempts_check check (attempts >= 0),
  constraint integration_outbox_idempotency_unique
    unique (source_app, destination_app, idempotency_key)
);

create index if not exists idx_integration_outbox_claim
  on core.integration_outbox (destination_app, source_app, event_type, available_at, created_at)
  where status in ('pending', 'failed');
create index if not exists idx_integration_outbox_processing
  on core.integration_outbox (status, locked_at)
  where status = 'processing';
create index if not exists idx_integration_outbox_aggregate
  on core.integration_outbox (source_app, aggregate_type, aggregate_id, created_at desc);

alter table core.integration_outbox enable row level security;
revoke all on core.integration_outbox from public, anon, authenticated, service_role;

create or replace function core.enqueue_integration_event(
  p_source_app text,
  p_destination_app text,
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_payload jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = core, public
as $$
declare
  queued_id uuid;
begin
  if nullif(trim(p_source_app), '') is null
     or nullif(trim(p_destination_app), '') is null
     or nullif(trim(p_event_type), '') is null
     or nullif(trim(p_aggregate_type), '') is null
     or nullif(trim(p_idempotency_key), '') is null then
    raise exception 'Integration event identity is incomplete.';
  end if;
  if p_source_app = p_destination_app then
    raise exception 'Integration events must cross an application boundary.';
  end if;
  if octet_length(coalesce(p_payload, '{}'::jsonb)::text) > 262144 then
    raise exception 'Integration event payload exceeds 256 KB.';
  end if;

  insert into core.integration_outbox (
    source_app,
    destination_app,
    event_type,
    aggregate_type,
    aggregate_id,
    payload,
    idempotency_key
  )
  values (
    trim(p_source_app),
    trim(p_destination_app),
    trim(p_event_type),
    trim(p_aggregate_type),
    p_aggregate_id,
    coalesce(p_payload, '{}'::jsonb),
    trim(p_idempotency_key)
  )
  on conflict (source_app, destination_app, idempotency_key)
  do update set updated_at = core.integration_outbox.updated_at
  returning id into queued_id;

  return queued_id;
end;
$$;

create or replace function core.claim_integration_events(
  p_destination_app text,
  p_source_app text,
  p_event_type text,
  p_worker text,
  p_limit integer default 20
)
returns setof core.integration_outbox
language plpgsql
security definer
set search_path = core, public
as $$
begin
  if nullif(trim(p_worker), '') is null then
    raise exception 'A worker identity is required.';
  end if;

  return query
  with claimed as (
    select event.id
    from core.integration_outbox event
    where event.destination_app = p_destination_app
      and event.source_app = p_source_app
      and event.event_type = p_event_type
      and event.status in ('pending', 'failed')
      and event.available_at <= now()
      and event.attempts < 10
    order by event.created_at, event.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update core.integration_outbox event
  set status = 'processing',
      attempts = event.attempts + 1,
      locked_at = now(),
      locked_by = left(trim(p_worker), 180),
      updated_at = now()
  from claimed
  where event.id = claimed.id
  returning event.*;
end;
$$;

create or replace function core.complete_integration_event(
  p_event_id uuid,
  p_worker text,
  p_succeeded boolean,
  p_error text default '',
  p_result jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = core, public
as $$
declare
  current_attempts integer;
begin
  select attempts into current_attempts
  from core.integration_outbox
  where id = p_event_id
    and status = 'processing'
    and locked_by = left(trim(p_worker), 180)
  for update;

  if current_attempts is null then
    raise exception 'The integration event is not owned by this worker.';
  end if;

  update core.integration_outbox
  set status = case
        when p_succeeded then 'succeeded'
        when current_attempts >= 10 then 'dead_letter'
        else 'failed'
      end,
      available_at = case
        when p_succeeded then available_at
        else now() + make_interval(secs => least(3600, 15 * (2 ^ least(current_attempts, 8)))::integer)
      end,
      processed_at = case when p_succeeded then now() else null end,
      locked_at = null,
      locked_by = null,
      last_error = case when p_succeeded then '' else left(coalesce(p_error, 'Unknown integration failure.'), 4000) end,
      result = coalesce(p_result, '{}'::jsonb),
      updated_at = now()
  where id = p_event_id;
end;
$$;

alter function core.enqueue_integration_event(text, text, text, text, uuid, jsonb, text) owner to postgres;
alter function core.claim_integration_events(text, text, text, text, integer) owner to postgres;
alter function core.complete_integration_event(uuid, text, boolean, text, jsonb) owner to postgres;
revoke all on function core.enqueue_integration_event(text, text, text, text, uuid, jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function core.claim_integration_events(text, text, text, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function core.complete_integration_event(uuid, text, boolean, text, jsonb)
  from public, anon, authenticated, service_role;

create table if not exists core.retention_policies (
  id uuid primary key default gen_random_uuid(),
  target_schema text not null,
  target_table text not null,
  timestamp_column text not null,
  retention_days integer not null,
  delete_enabled boolean not null default false,
  business_record boolean not null default false,
  rationale text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target_schema, target_table),
  check (retention_days > 0),
  check (not business_record or not delete_enabled)
);

alter table core.retention_policies enable row level security;
revoke all on core.retention_policies from public, anon, authenticated, service_role;

insert into core.retention_policies (
  target_schema,
  target_table,
  timestamp_column,
  retention_days,
  delete_enabled,
  business_record,
  rationale
)
values
  ('app_production_management', 'profile_verification_codes', 'expires_at', 30, false, false,
   'Expired six-digit verification challenges; Preview reports only.'),
  ('app_production_management', 'public_profile_sessions', 'expires_at', 30, false, false,
   'Expired profile bearer sessions; Preview reports only.'),
  ('app_production_management', 'profile_access_links', 'expires_at', 90, false, false,
   'Expired branded profile access links; Preview reports only.'),
  ('core', 'integration_outbox', 'processed_at', 90, false, false,
   'Successfully delivered integration events; failures and dead letters are retained.'),
  ('app_production_management', 'audition_export_audit', 'created_at', 2555, false, true,
   'Audition export audit is a protected business/security record.'),
  ('app_playbill', 'audit_log', 'changed_at', 2555, false, true,
   'Playbill editorial audit is a protected business/security record.')
on conflict (target_schema, target_table)
do update set
  timestamp_column = excluded.timestamp_column,
  retention_days = excluded.retention_days,
  delete_enabled = false,
  business_record = excluded.business_record,
  rationale = excluded.rationale,
  updated_at = now();

create or replace function core.retention_preview()
returns table (
  target_schema text,
  target_table text,
  retention_days integer,
  delete_enabled boolean,
  business_record boolean,
  eligible_rows bigint,
  rationale text
)
language plpgsql
security definer
set search_path = core, public
as $$
declare
  policy_record core.retention_policies;
  candidate_count bigint;
begin
  for policy_record in
    select * from core.retention_policies
    order by target_schema, target_table
  loop
    execute format(
      'select count(*) from %I.%I where %I is not null and %I < now() - make_interval(days => $1)',
      policy_record.target_schema,
      policy_record.target_table,
      policy_record.timestamp_column,
      policy_record.timestamp_column
    )
    into candidate_count
    using policy_record.retention_days;

    target_schema := policy_record.target_schema;
    target_table := policy_record.target_table;
    retention_days := policy_record.retention_days;
    delete_enabled := policy_record.delete_enabled;
    business_record := policy_record.business_record;
    eligible_rows := candidate_count;
    rationale := policy_record.rationale;
    return next;
  end loop;
end;
$$;

alter function core.retention_preview() owner to postgres;
revoke all on function core.retention_preview() from public, anon, authenticated;
grant execute on function core.retention_preview() to service_role;

create table if not exists core.operational_metric_snapshots (
  id bigint generated by default as identity primary key,
  metric_name text not null,
  metric_value numeric not null,
  dimensions jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);

create index if not exists idx_operational_metric_name_observed
  on core.operational_metric_snapshots (metric_name, observed_at desc);
alter table core.operational_metric_snapshots enable row level security;
revoke all on core.operational_metric_snapshots from public, anon, authenticated, service_role;

create or replace function core.capture_phase8_metrics()
returns jsonb
language plpgsql
security definer
set search_path = core, app_production_management, storage, public
as $$
declare
  captured_at timestamptz := now();
  database_bytes bigint;
  pending_events bigint;
  failed_events bigint;
  oldest_pending_seconds numeric;
  audition_database_files bigint;
  audition_storage_files bigint;
begin
  select pg_database_size(current_database()) into database_bytes;
  select count(*) filter (where status in ('pending', 'processing')),
         count(*) filter (where status in ('failed', 'dead_letter')),
         coalesce(extract(
           epoch from (
             captured_at - min(created_at)
               filter (where status in ('pending', 'processing', 'failed'))
           )
         ), 0)
  into pending_events, failed_events, oldest_pending_seconds
  from core.integration_outbox;
  select count(*) into audition_database_files
  from app_production_management.audition_files
  where file_data is not null;
  select count(*) into audition_storage_files
  from storage.objects
  where bucket_id = 'audition-files';

  insert into core.operational_metric_snapshots (metric_name, metric_value, observed_at)
  values
    ('database_bytes', database_bytes, captured_at),
    ('integration_pending_events', pending_events, captured_at),
    ('integration_failed_events', failed_events, captured_at),
    ('integration_oldest_pending_seconds', oldest_pending_seconds, captured_at),
    ('audition_database_files', audition_database_files, captured_at),
    ('audition_storage_files', audition_storage_files, captured_at);

  return jsonb_build_object(
    'observed_at', captured_at,
    'database_bytes', database_bytes,
    'integration_pending_events', pending_events,
    'integration_failed_events', failed_events,
    'integration_oldest_pending_seconds', oldest_pending_seconds,
    'audition_database_files', audition_database_files,
    'audition_storage_files', audition_storage_files,
    'failed_auth_monitoring', 'supabase_dashboard',
    'policy_denial_monitoring', 'supabase_dashboard',
    'backup_monitoring', 'supabase_dashboard'
  );
end;
$$;

alter function core.capture_phase8_metrics() owner to postgres;
revoke all on function core.capture_phase8_metrics() from public, anon, authenticated;
grant execute on function core.capture_phase8_metrics() to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audition-files',
  'audition-files',
  false,
  3145728,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id)
do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table app_production_management.audition_files
  alter column file_data drop not null,
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists sha256 text,
  add column if not exists storage_state text not null default 'database_only',
  add column if not exists storage_mirrored_at timestamptz,
  add column if not exists integrity_verified_at timestamptz;

update app_production_management.audition_files
set storage_state = case
  when storage_path is not null then 'mirrored'
  else 'database_only'
end
where storage_state not in ('database_only', 'mirrored', 'storage_only');

alter table app_production_management.audition_files
  drop constraint if exists audition_files_storage_state_check;
alter table app_production_management.audition_files
  add constraint audition_files_storage_state_check
  check (storage_state in ('database_only', 'mirrored', 'storage_only'));
alter table app_production_management.audition_files
  drop constraint if exists audition_files_payload_location_check;
alter table app_production_management.audition_files
  add constraint audition_files_payload_location_check
  check (file_data is not null or (storage_bucket is not null and storage_path is not null)) not valid;

create unique index if not exists uq_pm_audition_files_storage_path
  on app_production_management.audition_files (storage_bucket, storage_path)
  where storage_path is not null;
create index if not exists idx_pm_audition_files_submission
  on app_production_management.audition_files (submission_id);
create index if not exists idx_pm_audition_slots_session_starts
  on app_production_management.audition_slots (session_id, starts_at);
create index if not exists idx_pm_people_auth_user
  on app_production_management.people (auth_user_id)
  where auth_user_id is not null;
alter table app_production_management.project_publicity_submissions
  drop constraint if exists project_publicity_submissions_playbill_sync_status_check;
alter table app_production_management.project_publicity_submissions
  add constraint project_publicity_submissions_playbill_sync_status_check
  check (playbill_sync_status in ('not_ready', 'pending', 'queued', 'synced', 'failed', 'disabled'));
create index if not exists idx_pm_publicity_sync_queue
  on app_production_management.project_publicity_submissions (playbill_sync_status, updated_at)
  where playbill_sync_status in ('pending', 'queued', 'failed');
create index if not exists idx_pm_integration_log_created
  on app_production_management.integration_reconciliation_log (created_at desc);
create index if not exists idx_pm_audit_log_entity_created
  on app_production_management.audit_log (entity_type, entity_id, created_at desc);

create or replace function app_production_management.enqueue_playbill_publicity_event(
  target_submission_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = app_production_management, core, public
as $$
declare
  submission app_production_management.project_publicity_submissions;
  playbill_show_id text;
  playbill_person_id text;
  request_ids text[];
  event_payload jsonb;
  event_id uuid;
  event_fingerprint text;
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
  if nullif(playbill_show_id, '') is null then
    raise exception 'This project is not linked to a Playbill show.';
  end if;

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

  event_payload := jsonb_build_object(
    'submission_id', submission.id,
    'project_id', submission.project_id,
    'person_id', submission.person_id,
    'show_id', playbill_show_id,
    'playbill_person_id', playbill_person_id,
    'request_ids', to_jsonb(request_ids),
    'credited_name', submission.credited_name,
    'bio', submission.bio,
    'headshot_url', submission.headshot_url,
    'source_profile_version', submission.source_profile_version
  );
  event_fingerprint := encode(extensions.digest(event_payload::text, 'sha256'), 'hex');

  event_id := core.enqueue_integration_event(
    'production_management',
    'playbill',
    'production_management.publicity.approved',
    'project_publicity_submission',
    submission.id,
    event_payload,
    format('publicity:%s:%s', submission.id, event_fingerprint)
  );

  update app_production_management.project_publicity_submissions
  set playbill_sync_status = 'queued',
      playbill_sync_error = '',
      playbill_last_reconciled_at = now()
  where id = submission.id;

  return jsonb_build_object('event_id', event_id, 'status', 'queued');
end;
$$;

create or replace function app_production_management.process_playbill_publicity_events(
  worker_name text,
  batch_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = app_production_management, core, public
as $$
declare
  event core.integration_outbox;
  processed integer := 0;
  failed integer := 0;
  approval_id uuid;
  playbill_status text;
begin
  for event in
    select * from core.claim_integration_events(
      'production_management',
      'playbill',
      'playbill.publicity.changed',
      worker_name,
      batch_limit
    )
  loop
    begin
      approval_id := nullif(event.payload ->> 'production_management_approval_id', '')::uuid;
      playbill_status := coalesce(event.payload ->> 'submission_status', 'pending');
      if approval_id is null then
        raise exception 'Playbill event is missing a Production Management approval id.';
      end if;
      if playbill_status not in ('pending', 'draft', 'submitted', 'returned', 'approved', 'locked') then
        raise exception 'Playbill event contains an invalid submission status.';
      end if;

      update app_production_management.project_publicity_submissions
      set credited_name = coalesce(nullif(trim(event.payload ->> 'full_name'), ''), credited_name),
          bio = coalesce(event.payload ->> 'bio', ''),
          headshot_url = coalesce(event.payload ->> 'headshot_url', ''),
          playbill_submission_status = playbill_status,
          status = case
            when playbill_status = 'returned' then 'changes_requested'
            when playbill_status in ('approved', 'locked') then 'approved'
            when playbill_status = 'submitted' then 'person_approved'
            else status
          end,
          editorial_approved_at = case
            when playbill_status in ('approved', 'locked') then coalesce(editorial_approved_at, now())
            when playbill_status in ('submitted', 'returned', 'draft', 'pending') then null
            else editorial_approved_at
          end,
          playbill_sync_status = 'synced',
          playbill_sync_error = '',
          playbill_synced_at = now(),
          playbill_last_reconciled_at = now(),
          playbill_locked_at = case
            when playbill_status = 'locked' then coalesce(playbill_locked_at, now())
            else null
          end
      where id = approval_id;

      if not found then
        raise exception 'The linked Production Management publicity record was not found.';
      end if;

      perform core.complete_integration_event(
        event.id,
        worker_name,
        true,
        '',
        jsonb_build_object('production_management_approval_id', approval_id)
      );
      processed := processed + 1;
    exception when others then
      perform core.complete_integration_event(event.id, worker_name, false, sqlerrm, '{}'::jsonb);
      failed := failed + 1;
    end;
  end loop;

  return jsonb_build_object('processed', processed, 'failed', failed);
end;
$$;

alter function app_production_management.enqueue_playbill_publicity_event(uuid) owner to postgres;
alter function app_production_management.process_playbill_publicity_events(text, integer) owner to postgres;
revoke all on function app_production_management.enqueue_playbill_publicity_event(uuid)
  from public, anon, authenticated;
revoke all on function app_production_management.process_playbill_publicity_events(text, integer)
  from public, anon, authenticated;
grant execute on function app_production_management.enqueue_playbill_publicity_event(uuid)
  to service_role;
grant execute on function app_production_management.process_playbill_publicity_events(text, integer)
  to service_role;

commit;
