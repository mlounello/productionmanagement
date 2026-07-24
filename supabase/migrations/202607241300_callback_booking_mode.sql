begin;

create or replace function app_production_management.get_public_callback_invitation(invitation_token uuid)
returns jsonb language sql stable security definer set search_path=app_production_management,public as $$
select jsonb_build_object(
  'invitation',jsonb_build_object('id',i.id,'status',i.status,'expires_at',i.expires_at,'slot_id',i.slot_id),
  'project',jsonb_build_object('id',p.id,'title',p.title),
  'applicant',jsonb_build_object('name',coalesce(nullif(person.preferred_name,''),person.full_name),'email',person.email),
  'sessions',coalesce((select jsonb_agg(to_jsonb(s) order by s.starts_at) from audition_sessions s
    where s.project_id=i.project_id and s.session_type='callback' and s.is_published
      and (s.booking_mode='self_book' or exists(select 1 from audition_slots current_slot where current_slot.session_id=s.id and current_slot.id=i.slot_id))
      and (s.booking_opens_at is null or s.booking_opens_at<=now())
      and (s.booking_closes_at is null or s.booking_closes_at>now())),'[]'::jsonb),
  'slots',coalesce((select jsonb_agg(to_jsonb(sl)||jsonb_build_object('booked',(select count(*) from audition_submission_slots b join audition_submissions bs on bs.id=b.submission_id where b.slot_id=sl.id and bs.cancelled_at is null)) order by sl.starts_at)
    from audition_slots sl join audition_sessions sx on sx.id=sl.session_id
    where sx.project_id=i.project_id and sx.session_type='callback' and sx.is_published and sl.status='open'
      and (sx.booking_mode='self_book' or sl.id=i.slot_id)
      and (sx.booking_opens_at is null or sx.booking_opens_at<=now())
      and (sx.booking_closes_at is null or sx.booking_closes_at>now())),'[]'::jsonb)
)
from callback_invitations i join projects p on p.id=i.project_id join audition_submissions sub on sub.id=i.submission_id join people person on person.id=sub.person_id
where i.public_token=invitation_token and i.status in('invited','booked') and (i.expires_at is null or i.expires_at>now());
$$;

create or replace function app_production_management.respond_to_callback_invitation(invitation_token uuid,requested_action text,selected_slot_id uuid default null)
returns jsonb language plpgsql security definer set search_path=app_production_management,public as $$
declare i callback_invitations;sl audition_slots;occupied integer;
begin
  select * into i from callback_invitations where public_token=invitation_token and status in('invited','booked') and (expires_at is null or expires_at>now()) for update;
  if i.id is null then raise exception 'This callback invitation is unavailable or expired.';end if;
  if requested_action='decline' then
    delete from audition_submission_slots where submission_id=i.submission_id and field_key='callback_booking';
    update callback_invitations set status='declined',slot_id=null,responded_at=now(),updated_at=now() where id=i.id;
    update audition_submissions set callback_status='declined' where id=i.submission_id;
    return jsonb_build_object('ok',true,'status','declined');
  end if;
  if requested_action<>'book' or selected_slot_id is null then raise exception 'Choose a callback time.';end if;
  select slot.* into sl from audition_slots slot join audition_sessions sx on sx.id=slot.session_id
  where slot.id=selected_slot_id and sx.project_id=i.project_id and sx.session_type='callback'
    and sx.is_published and sx.booking_mode='self_book' and slot.status='open'
    and (sx.booking_opens_at is null or sx.booking_opens_at<=now())
    and (sx.booking_closes_at is null or sx.booking_closes_at>now())
  for update;
  if sl.id is null then raise exception 'That callback time is unavailable.';end if;
  select count(*) into occupied from audition_submission_slots b join audition_submissions sub on sub.id=b.submission_id where b.slot_id=sl.id and sub.cancelled_at is null and sub.id<>i.submission_id;
  if occupied>=sl.capacity then raise exception 'That callback time has just filled. Choose another time.';end if;
  delete from audition_submission_slots where submission_id=i.submission_id and field_key='callback_booking';
  insert into audition_submission_slots(submission_id,slot_id,field_key) values(i.submission_id,sl.id,'callback_booking')
  on conflict(submission_id,slot_id) do update set field_key='callback_booking';
  update callback_invitations set status='booked',slot_id=sl.id,responded_at=now(),updated_at=now() where id=i.id;
  update audition_submissions set callback_status='invited' where id=i.submission_id;
  return jsonb_build_object('ok',true,'status','booked','slot_id',sl.id);
end;$$;

grant execute on function app_production_management.get_public_callback_invitation(uuid) to anon,authenticated,service_role;
grant execute on function app_production_management.respond_to_callback_invitation(uuid,text,uuid) to anon,authenticated,service_role;
commit;
