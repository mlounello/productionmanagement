begin;

create or replace function app_production_management.enforce_audition_slot_capacity()
returns trigger
language plpgsql
security definer
set search_path=app_production_management,public
as $$
declare
  allowed_capacity integer;
  occupied integer;
begin
  select capacity into allowed_capacity
  from audition_slots
  where id=new.slot_id
  for update;

  if allowed_capacity is null then raise exception 'That audition slot is unavailable.'; end if;

  select count(*) into occupied
  from audition_submission_slots booking
  join audition_submissions submission on submission.id=booking.submission_id
  where booking.slot_id=new.slot_id
    and booking.submission_id<>new.submission_id
    and submission.cancelled_at is null;

  if occupied>=allowed_capacity then
    raise exception 'That audition slot has just filled. Choose another time.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_audition_slot_capacity_trigger
  on app_production_management.audition_submission_slots;
create trigger enforce_audition_slot_capacity_trigger
before insert or update of slot_id
on app_production_management.audition_submission_slots
for each row execute function app_production_management.enforce_audition_slot_capacity();

create or replace function app_production_management.staff_move_audition_booking(
  target_project_id uuid,
  target_submission_id uuid,
  target_field_key text,
  target_slot_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=app_production_management,public
as $$
declare
  current_booking audition_submission_slots;
  target_submission audition_submissions;
  current_category text;
  destination_category text;
begin
  if not can_manage_auditions(target_project_id) then raise exception 'You do not have permission to move audition bookings.'; end if;
  if right(target_field_key,6)='__auto' then raise exception 'Move the applicant-selected booking that controls this automatic reservation.'; end if;

  select * into target_submission from audition_submissions
  where id=target_submission_id and project_id=target_project_id and cancelled_at is null
  for update;
  if target_submission.id is null then raise exception 'The active audition submission was not found.'; end if;

  select booking.* into current_booking
  from audition_submission_slots booking
  where booking.submission_id=target_submission_id and booking.field_key=target_field_key;
  if current_booking.submission_id is null then raise exception 'The audition booking was not found.'; end if;

  select session.booking_category into current_category
  from audition_slots slot join audition_sessions session on session.id=slot.session_id
  where slot.id=current_booking.slot_id;

  perform 1
  from audition_slots slot join audition_sessions session on session.id=slot.session_id
  where slot.id=target_slot_id and session.project_id=target_project_id and slot.status='open'
  for update of slot;
  if not found then raise exception 'The destination audition slot is unavailable.'; end if;

  select session.booking_category into destination_category
  from audition_slots slot join audition_sessions session on session.id=slot.session_id
  where slot.id=target_slot_id;
  if coalesce(current_category,'general')<>coalesce(destination_category,'general') then
    raise exception 'Choose another time from the same audition booking category.';
  end if;

  update audition_submission_slots set slot_id=target_slot_id
  where submission_id=target_submission_id and field_key=target_field_key;
  if target_submission.slot_id=current_booking.slot_id then
    update audition_submissions set slot_id=target_slot_id where id=target_submission_id;
  end if;
  return jsonb_build_object('ok',true,'old_slot_id',current_booking.slot_id,'new_slot_id',target_slot_id);
end;
$$;

revoke all on function app_production_management.staff_move_audition_booking(uuid,uuid,text,uuid) from public;
grant execute on function app_production_management.staff_move_audition_booking(uuid,uuid,text,uuid) to authenticated,service_role;

commit;
