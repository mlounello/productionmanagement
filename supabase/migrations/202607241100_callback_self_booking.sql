begin;

update app_production_management.audition_form_fields set required=true
where field_key in ('intimacy_comfort','callback_availability');

create table if not exists app_production_management.callback_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects(id) on delete cascade,
  submission_id uuid not null unique references app_production_management.audition_submissions(id) on delete cascade,
  public_token uuid not null unique default gen_random_uuid(),
  status text not null default 'draft' check(status in('draft','invited','booked','declined','expired')),
  slot_id uuid references app_production_management.audition_slots(id) on delete set null,
  expires_at timestamptz,
  sent_at timestamptz,
  responded_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select,insert,update,delete on app_production_management.callback_invitations to authenticated,service_role;
alter table app_production_management.callback_invitations enable row level security;
drop policy if exists "audition managers callback invitations" on app_production_management.callback_invitations;
create policy "audition managers callback invitations" on app_production_management.callback_invitations
for all to authenticated using(app_production_management.can_manage_auditions(project_id))
with check(app_production_management.can_manage_auditions(project_id));

create or replace function app_production_management.get_public_callback_invitation(invitation_token uuid)
returns jsonb language sql stable security definer set search_path=app_production_management,public as $$
select jsonb_build_object(
  'invitation',jsonb_build_object('id',i.id,'status',i.status,'expires_at',i.expires_at,'slot_id',i.slot_id),
  'project',jsonb_build_object('id',p.id,'title',p.title),
  'applicant',jsonb_build_object('name',coalesce(nullif(person.preferred_name,''),person.full_name),'email',person.email),
  'sessions',coalesce((select jsonb_agg(to_jsonb(s) order by s.starts_at) from audition_sessions s where s.project_id=i.project_id and s.session_type='callback' and s.is_published),'[]'::jsonb),
  'slots',coalesce((select jsonb_agg(to_jsonb(sl)||jsonb_build_object('booked',(select count(*) from audition_submission_slots b join audition_submissions bs on bs.id=b.submission_id where b.slot_id=sl.id and bs.cancelled_at is null)) order by sl.starts_at)
    from audition_slots sl join audition_sessions sx on sx.id=sl.session_id where sx.project_id=i.project_id and sx.session_type='callback' and sx.is_published and sl.status='open'),'[]'::jsonb)
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
  select slot.* into sl from audition_slots slot join audition_sessions sx on sx.id=slot.session_id where slot.id=selected_slot_id and sx.project_id=i.project_id and sx.session_type='callback' and sx.is_published and slot.status='open' for update;
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

revoke all on function app_production_management.get_public_callback_invitation(uuid) from public;
revoke all on function app_production_management.respond_to_callback_invitation(uuid,text,uuid) from public;
grant execute on function app_production_management.get_public_callback_invitation(uuid) to anon,authenticated,service_role;
grant execute on function app_production_management.respond_to_callback_invitation(uuid,text,uuid) to anon,authenticated,service_role;
commit;
