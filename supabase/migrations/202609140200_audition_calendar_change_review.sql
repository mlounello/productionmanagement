begin;

alter table app_production_management.project_google_calendar_settings
  add column if not exists last_change_check_at timestamptz,
  add column if not exists last_change_check_error text not null default '';

create table if not exists app_production_management.audition_calendar_change_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects(id) on delete cascade,
  slot_id uuid not null references app_production_management.audition_slots(id) on delete cascade,
  google_calendar_event_id text not null,
  current_starts_at timestamptz not null,
  current_ends_at timestamptz not null,
  proposed_starts_at timestamptz not null,
  proposed_ends_at timestamptz not null,
  google_updated_at timestamptz,
  status text not null default 'pending' check(status in('pending','approved','denied','stale','failed')),
  detected_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  error_message text not null default '',
  unique(slot_id,proposed_starts_at,proposed_ends_at)
);

create index if not exists audition_calendar_changes_project_status_idx
  on app_production_management.audition_calendar_change_reviews(project_id,status,detected_at desc);

grant select,insert,update,delete on app_production_management.audition_calendar_change_reviews to authenticated,service_role;
alter table app_production_management.audition_calendar_change_reviews enable row level security;
drop policy if exists "audition managers review calendar changes" on app_production_management.audition_calendar_change_reviews;
create policy "audition managers review calendar changes"
on app_production_management.audition_calendar_change_reviews for all to authenticated
using(app_production_management.can_manage_auditions(project_id))
with check(app_production_management.can_manage_auditions(project_id));

create or replace function app_production_management.approve_audition_calendar_change(target_project_id uuid,target_change_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=app_production_management,public
as $$
declare
  change_record audition_calendar_change_reviews;
  source_slot audition_slots;
  source_session audition_sessions;
  destination_slot audition_slots;
  moving_count integer;
  occupied integer;
  affected_submission_ids uuid[];
begin
  if not can_manage_auditions(target_project_id) then raise exception 'You do not have permission to approve calendar changes.'; end if;
  select * into change_record from audition_calendar_change_reviews where id=target_change_id and project_id=target_project_id and status='pending' for update;
  if change_record.id is null then raise exception 'That pending calendar change was not found.'; end if;
  select * into source_slot from audition_slots where id=change_record.slot_id for update;
  select * into source_session from audition_sessions where id=source_slot.session_id;
  if source_slot.starts_at<>change_record.current_starts_at or coalesce(source_slot.ends_at,source_slot.starts_at)<>change_record.current_ends_at then
    update audition_calendar_change_reviews set status='stale',reviewed_at=now(),reviewed_by=auth.uid(),error_message='The Production Management time changed after this difference was detected.' where id=change_record.id;
    raise exception 'This change is stale. Check Calendar again.';
  end if;

  select slot.* into destination_slot
  from audition_slots slot join audition_sessions session on session.id=slot.session_id
  where session.project_id=target_project_id
    and coalesce(session.booking_category,'general')=coalesce(source_session.booking_category,'general')
    and slot.id<>source_slot.id and slot.status='open'
    and slot.starts_at=change_record.proposed_starts_at
    and coalesce(slot.ends_at,slot.starts_at)=change_record.proposed_ends_at
  order by slot.created_at limit 1 for update of slot;

  select coalesce(array_agg(distinct submission.id),'{}'::uuid[]),count(distinct booking.submission_id)
  into affected_submission_ids,moving_count
  from audition_submission_slots booking join audition_submissions submission on submission.id=booking.submission_id
  where booking.slot_id=source_slot.id and submission.cancelled_at is null;

  if destination_slot.id is not null then
    select count(distinct booking.submission_id) into occupied
    from audition_submission_slots booking join audition_submissions submission on submission.id=booking.submission_id
    where booking.slot_id=destination_slot.id and submission.cancelled_at is null
      and not(submission.id=any(affected_submission_ids));
    if occupied+moving_count>destination_slot.capacity then raise exception 'The destination time is already full.'; end if;
    update audition_submission_slots set slot_id=destination_slot.id where slot_id=source_slot.id and submission_id=any(affected_submission_ids);
    update audition_submissions set slot_id=destination_slot.id where id=any(affected_submission_ids) and slot_id=source_slot.id;
  else
    if exists(select 1 from audition_slots slot join audition_sessions session on session.id=slot.session_id where session.project_id=target_project_id and slot.id<>source_slot.id and tstzrange(slot.starts_at,coalesce(slot.ends_at,slot.starts_at+interval '1 minute'),'[)') && tstzrange(change_record.proposed_starts_at,change_record.proposed_ends_at,'[)')) then
      raise exception 'That Calendar time overlaps another configured audition slot. Move it to an existing available slot or deny the change.';
    end if;
    update audition_slots set starts_at=change_record.proposed_starts_at,ends_at=change_record.proposed_ends_at where id=source_slot.id;
    if (select count(*) from audition_slots where session_id=source_session.id)=1 then
      update audition_sessions set starts_at=change_record.proposed_starts_at,ends_at=change_record.proposed_ends_at where id=source_session.id;
    end if;
  end if;
  update audition_calendar_change_reviews set status='approved',reviewed_at=now(),reviewed_by=auth.uid(),error_message='' where id=change_record.id;
  return jsonb_build_object('source_slot_id',source_slot.id,'destination_slot_id',destination_slot.id,'submission_ids',affected_submission_ids);
end;
$$;

revoke all on function app_production_management.approve_audition_calendar_change(uuid,uuid) from public;
grant execute on function app_production_management.approve_audition_calendar_change(uuid,uuid) to authenticated,service_role;

commit;
