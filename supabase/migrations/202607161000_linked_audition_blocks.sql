begin;

alter table app_production_management.audition_sessions
  add column if not exists auto_assign_session_id uuid references app_production_management.audition_sessions(id) on delete set null;

create index if not exists audition_sessions_auto_assign_idx
  on app_production_management.audition_sessions(auto_assign_session_id)
  where auto_assign_session_id is not null;

create or replace function app_production_management.sync_auto_assigned_audition_slot()
returns trigger
language plpgsql
security definer
set search_path=app_production_management,public
as $$
declare
  source_session audition_sessions;
  linked_session audition_sessions;
  linked_slot audition_slots;
  target_submission audition_submissions;
  available_slot_count integer;
  current_bookings integer;
  linked_key text;
begin
  if right(new.field_key,6)='__auto' then return new; end if;

  linked_key:=new.field_key||'__auto';
  if tg_op='UPDATE' then
    delete from audition_submission_slots where submission_id=new.submission_id and field_key=linked_key;
  end if;

  select sx.* into source_session from audition_sessions sx join audition_slots sl on sl.session_id=sx.id where sl.id=new.slot_id;
  if source_session.auto_assign_session_id is null then return new; end if;
  if source_session.auto_assign_session_id=source_session.id then raise exception 'An audition block cannot automatically reserve itself.'; end if;

  select * into target_submission from audition_submissions where id=new.submission_id;
  select * into linked_session from audition_sessions where id=source_session.auto_assign_session_id and project_id=target_submission.project_id and is_published;
  if linked_session.id is null then raise exception 'The automatically assigned audition block is unavailable. Please contact production staff.'; end if;

  select count(*) into available_slot_count from audition_slots where session_id=linked_session.id and status='open';
  if available_slot_count<>1 then raise exception 'The automatically assigned audition block must contain exactly one available slot.'; end if;
  select * into linked_slot from audition_slots where session_id=linked_session.id and status='open' for update;

  select count(*) into current_bookings
  from audition_submission_slots b
  join audition_submissions sub on sub.id=b.submission_id
  where b.slot_id=linked_slot.id and sub.cancelled_at is null and sub.id<>new.submission_id;
  if current_bookings>=linked_slot.capacity then raise exception 'The dance or group call linked to that audition time is full.'; end if;

  insert into audition_submission_slots(submission_id,slot_id,field_key)
  values(new.submission_id,linked_slot.id,linked_key)
  on conflict(submission_id,field_key) do update set slot_id=excluded.slot_id;
  return new;
end;
$$;

drop trigger if exists sync_auto_assigned_audition_slot_trigger on app_production_management.audition_submission_slots;
create trigger sync_auto_assigned_audition_slot_trigger
after insert or update of slot_id on app_production_management.audition_submission_slots
for each row execute function app_production_management.sync_auto_assigned_audition_slot();

create or replace function app_production_management.manage_public_audition_submission(access_token uuid,requested_action text,selected_slot_id uuid default null)
returns jsonb language plpgsql security definer set search_path=app_production_management,public as $$
declare target audition_submissions;target_form audition_forms;target_slot audition_slots;current_session audition_sessions;booking_count integer;booking_key text;required_category text;new_category text;
begin
  select * into target from audition_submissions where applicant_token=access_token for update;if target.id is null then raise exception 'Submission not found.';end if;
  select * into target_form from audition_forms where id=target.form_id;select sx.* into current_session from audition_sessions sx join audition_slots sl on sl.session_id=sx.id where sl.id=target.slot_id;
  if requested_action='cancel' then
    if not target_form.allow_cancel then raise exception 'Cancellation is disabled.';end if;if current_session.cancel_deadline is not null and current_session.cancel_deadline<=now() then raise exception 'The cancellation deadline has passed.';end if;
    update audition_submissions set cancelled_at=now(),status='cancelled' where id=target.id;
  elsif requested_action='reschedule' then
    if not target_form.allow_reschedule then raise exception 'Rescheduling is disabled.';end if;
    select count(*),min(b.field_key) into booking_count,booking_key
    from audition_submission_slots b join audition_form_fields ff on ff.form_id=target.form_id and ff.field_key=b.field_key
    where b.submission_id=target.id;
    if booking_count>1 then raise exception 'This registration has multiple applicant-selected bookings. Contact production staff to change them together.';end if;
    if current_session.reschedule_deadline is not null and current_session.reschedule_deadline<=now() then raise exception 'The rescheduling deadline has passed.';end if;
    select sl.* into target_slot from audition_slots sl join audition_sessions sx on sx.id=sl.session_id where sl.id=selected_slot_id and sx.project_id=target.project_id and sx.is_published and sx.booking_mode='self_book' and sl.status='open' and sl.self_bookable for update;
    if target_slot.id is null then raise exception 'That audition slot is unavailable.';end if;
    select booking_category into new_category from audition_sessions where id=target_slot.session_id;select coalesce(nullif(settings->>'booking_category',''),'general') into required_category from audition_form_fields where form_id=target.form_id and field_key=booking_key;
    if coalesce(new_category,'general')<>coalesce(required_category,'general') then raise exception 'Choose a time from the same audition category.';end if;
    if(select count(*) from audition_submission_slots b join audition_submissions sub on sub.id=b.submission_id where b.slot_id=target_slot.id and sub.cancelled_at is null and sub.id<>target.id)>=target_slot.capacity then raise exception 'That audition slot is full.';end if;
    update audition_submissions set slot_id=selected_slot_id,cancelled_at=null,status='submitted' where id=target.id;
    update audition_submission_slots set slot_id=selected_slot_id where submission_id=target.id and field_key=booking_key;
  else raise exception 'Unsupported action.';end if;return jsonb_build_object('ok',true);
end;$$;

grant execute on function app_production_management.manage_public_audition_submission(uuid,text,uuid) to anon,authenticated;

create or replace function app_production_management.get_public_audition_booking_summary(access_token uuid)
returns jsonb
language sql
stable
security definer
set search_path=app_production_management,public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'field_key',b.field_key,
    'auto_assigned',right(b.field_key,6)='__auto',
    'slot_id',sl.id,
    'starts_at',sl.starts_at,
    'ends_at',sl.ends_at,
    'title',sx.title,
    'location',sx.location
  ) order by sl.starts_at),'[]'::jsonb)
  from audition_submissions sub
  join audition_submission_slots b on b.submission_id=sub.id
  join audition_slots sl on sl.id=b.slot_id
  join audition_sessions sx on sx.id=sl.session_id
  where sub.applicant_token=access_token;
$$;

revoke all on function app_production_management.get_public_audition_booking_summary(uuid) from public;
grant execute on function app_production_management.get_public_audition_booking_summary(uuid) to anon,authenticated,service_role;

commit;
