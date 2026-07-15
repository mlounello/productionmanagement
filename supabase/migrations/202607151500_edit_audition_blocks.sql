begin;

create or replace function app_production_management.update_audition_session_block(target_project_id uuid,target_session_id uuid,session_payload jsonb,slot_payload jsonb,rebuild_slots boolean)
returns void language plpgsql security definer set search_path=app_production_management,public as $$
begin
  if not app_production_management.can_manage_auditions(target_project_id) then raise exception 'You do not have permission to edit this audition block.';end if;
  perform 1 from audition_sessions where id=target_session_id and project_id=target_project_id for update;if not found then raise exception 'Audition block not found.';end if;
  if rebuild_slots and exists(select 1 from audition_submission_slots booking join audition_slots slot on slot.id=booking.slot_id where slot.session_id=target_session_id) then raise exception 'This block already has applicant bookings. Its booking structure is locked.';end if;
  update audition_sessions set title=session_payload->>'title',location=coalesce(session_payload->>'location',''),starts_at=(session_payload->>'starts_at')::timestamptz,ends_at=(session_payload->>'ends_at')::timestamptz,booking_category=session_payload->>'booking_category',interval_minutes=(session_payload->>'interval_minutes')::integer,slots_per_interval=(session_payload->>'capacity')::integer,capacity=(session_payload->>'capacity')::integer,session_type=session_payload->>'session_type',booking_mode=session_payload->>'booking_mode',instructions=coalesce(session_payload->>'instructions',''),is_published=(session_payload->>'is_published')::boolean,booking_opens_at=nullif(session_payload->>'booking_opens_at','')::timestamptz,booking_closes_at=nullif(session_payload->>'booking_closes_at','')::timestamptz,reschedule_deadline=nullif(session_payload->>'reschedule_deadline','')::timestamptz,cancel_deadline=nullif(session_payload->>'cancel_deadline','')::timestamptz where id=target_session_id;
  if rebuild_slots then
    delete from audition_slots where session_id=target_session_id;
    insert into audition_slots(session_id,starts_at,ends_at,capacity,slot_type,self_bookable)
    select target_session_id,row.starts_at::timestamptz,row.ends_at::timestamptz,row.capacity,row.slot_type,row.self_bookable from jsonb_to_recordset(slot_payload) as row(starts_at text,ends_at text,capacity integer,slot_type text,self_bookable boolean);
  end if;
end;$$;

grant execute on function app_production_management.update_audition_session_block(uuid,uuid,jsonb,jsonb,boolean) to authenticated;

commit;
