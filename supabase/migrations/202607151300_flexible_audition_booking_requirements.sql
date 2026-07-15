begin;

alter table app_production_management.audition_sessions
  add column if not exists booking_category text not null default 'general';

create table if not exists app_production_management.audition_submission_slots(
  submission_id uuid not null references app_production_management.audition_submissions(id) on delete cascade,
  slot_id uuid not null references app_production_management.audition_slots(id) on delete restrict,
  field_key text not null,
  created_at timestamptz not null default now(),
  primary key(submission_id,slot_id),
  unique(submission_id,field_key)
);

insert into app_production_management.audition_submission_slots(submission_id,slot_id,field_key)
select id,slot_id,'audition_slot' from app_production_management.audition_submissions
where slot_id is not null
on conflict do nothing;

alter table app_production_management.audition_submission_slots enable row level security;
grant select,insert,update,delete on app_production_management.audition_submission_slots to authenticated;
grant select,update on app_production_management.audition_submission_slots to service_role;

create policy "audition reviewers submission bookings" on app_production_management.audition_submission_slots
for all to authenticated
using(exists(select 1 from app_production_management.audition_submissions s where s.id=submission_id and app_production_management.can_review_auditions(s.project_id)))
with check(exists(select 1 from app_production_management.audition_submissions s where s.id=submission_id and app_production_management.can_manage_auditions(s.project_id)));

create or replace function app_production_management.submit_public_audition_v2(
  form_token uuid,
  answer_payload jsonb,
  booking_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=app_production_management,public
as $$
declare
  target_form audition_forms;
  target_slot audition_slots;
  target_session audition_sessions;
  booking_field audition_form_fields;
  normalized_email text;
  applicant_name text;
  matched_person people;
  new_person_id uuid;
  candidate_rows jsonb := '[]'::jsonb;
  duplicate_state text := 'clear';
  created_submission audition_submissions;
  booking record;
  primary_slot_id uuid;
begin
  select * into target_form from audition_forms
  where public_token=form_token and status='published' and (closes_at is null or closes_at>now());
  if target_form.id is null then raise exception 'Audition form is unavailable.'; end if;
  if jsonb_typeof(booking_payload)<>'object' then raise exception 'Invalid audition booking selections.'; end if;
  if (select count(*) from jsonb_each_text(booking_payload))>12 then raise exception 'Too many audition booking selections.'; end if;

  for booking in select key,value::uuid as slot_id from jsonb_each_text(booking_payload) order by value loop
    select * into booking_field from audition_form_fields where form_id=target_form.id and field_key=booking.key and field_type='slot_selector';
    if booking_field.id is null then raise exception 'Invalid audition booking requirement.'; end if;
    select sl.* into target_slot from audition_slots sl join audition_sessions sx on sx.id=sl.session_id
    where sl.id=booking.slot_id and sx.project_id=target_form.project_id and sx.is_published
      and sx.booking_mode='self_book' and sl.status='open' and sl.self_bookable for update;
    if target_slot.id is null then raise exception 'One of the selected audition times is unavailable.'; end if;
    select * into target_session from audition_sessions where id=target_slot.session_id;
    if target_session.booking_category<>coalesce(nullif(booking_field.settings->>'booking_category',''),'general') then raise exception 'An audition time was selected for the wrong requirement.'; end if;
    if (select count(*) from audition_submission_slots b join audition_submissions sub on sub.id=b.submission_id where b.slot_id=target_slot.id and sub.cancelled_at is null)>=target_slot.capacity then
      raise exception 'One of the selected audition times is full.';
    end if;
    primary_slot_id:=coalesce(primary_slot_id,target_slot.id);
  end loop;
  for booking in select key,value::uuid as slot_id from jsonb_each_text(booking_payload) loop
    select * into booking_field from audition_form_fields where form_id=target_form.id and field_key=booking.key;
    if coalesce(booking_field.settings->>'same_day_as','')<>'' and booking_payload ? (booking_field.settings->>'same_day_as') and
      (select (sl.starts_at at time zone 'America/New_York')::date from audition_slots sl where sl.id=booking.slot_id)<>
      (select (sl.starts_at at time zone 'America/New_York')::date from audition_slots sl where sl.id=(booking_payload->>(booking_field.settings->>'same_day_as'))::uuid)
    then raise exception 'Linked audition requirements must be booked on the same day.'; end if;
  end loop;

  normalized_email:=lower(trim(coalesce(answer_payload->>'email','')));
  applicant_name:=trim(coalesce(answer_payload->>'full_name',''));
  if normalized_email='' or applicant_name='' then raise exception 'Name and email are required.'; end if;
  select * into matched_person from people where lower(email)=normalized_email limit 1;
  if matched_person.id is not null then new_person_id:=matched_person.id;
  else
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'full_name',full_name,'email',email)),'[]'::jsonb) into candidate_rows from people where lower(full_name)=lower(applicant_name) limit 10;
    if jsonb_array_length(candidate_rows)>0 then duplicate_state:='needs_review'; end if;
    insert into people(full_name,preferred_name,email,phone,pronouns,affiliation,person_type)
    values(applicant_name,coalesce(answer_payload->>'preferred_name',''),normalized_email,coalesce(answer_payload->>'phone',''),coalesce(answer_payload->>'pronouns',''),case when coalesce(answer_payload->>'graduation_year','')<>'' then 'Siena '||(answer_payload->>'graduation_year') else '' end,'student') returning id into new_person_id;
  end if;
  insert into audition_submissions(project_id,form_id,slot_id,person_id,answers,applicant_email,form_version,duplicate_status,duplicate_candidates)
  values(target_form.project_id,target_form.id,primary_slot_id,new_person_id,answer_payload,normalized_email,target_form.version,duplicate_state,candidate_rows) returning * into created_submission;
  insert into audition_submission_slots(submission_id,slot_id,field_key)
  select created_submission.id,value::uuid,key from jsonb_each_text(booking_payload);
  return jsonb_build_object('submission_id',created_submission.id,'access_token',created_submission.applicant_token,'duplicate_status',duplicate_state);
end;
$$;

grant execute on function app_production_management.submit_public_audition_v2(uuid,jsonb,jsonb) to anon,authenticated;

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
    if not target_form.allow_reschedule then raise exception 'Rescheduling is disabled.';end if;select count(*),min(field_key) into booking_count,booking_key from audition_submission_slots where submission_id=target.id;
    if booking_count>1 then raise exception 'This registration has linked audition bookings. Contact production staff to change them together.';end if;
    if current_session.reschedule_deadline is not null and current_session.reschedule_deadline<=now() then raise exception 'The rescheduling deadline has passed.';end if;
    select sl.* into target_slot from audition_slots sl join audition_sessions sx on sx.id=sl.session_id where sl.id=selected_slot_id and sx.project_id=target.project_id and sx.is_published and sx.booking_mode='self_book' and sl.status='open' and sl.self_bookable for update;
    if target_slot.id is null then raise exception 'That audition slot is unavailable.';end if;
    select booking_category into new_category from audition_sessions where id=target_slot.session_id;select coalesce(nullif(settings->>'booking_category',''),'general') into required_category from audition_form_fields where form_id=target.form_id and field_key=booking_key;
    if coalesce(new_category,'general')<>coalesce(required_category,'general') then raise exception 'Choose a time from the same audition category.';end if;
    if(select count(*) from audition_submission_slots b join audition_submissions sub on sub.id=b.submission_id where b.slot_id=target_slot.id and sub.cancelled_at is null and sub.id<>target.id)>=target_slot.capacity then raise exception 'That audition slot is full.';end if;
    update audition_submissions set slot_id=selected_slot_id,cancelled_at=null,status='submitted' where id=target.id;update audition_submission_slots set slot_id=selected_slot_id where submission_id=target.id and field_key=booking_key;
  else raise exception 'Unsupported action.';end if;return jsonb_build_object('ok',true);
end;$$;

grant execute on function app_production_management.manage_public_audition_submission(uuid,text,uuid) to anon,authenticated;

create or replace function app_production_management.get_public_audition_form(form_token uuid)
returns jsonb language sql stable security definer set search_path=app_production_management,public as $$
select jsonb_build_object('form',to_jsonb(f),'project',jsonb_build_object('id',p.id,'title',p.title),
'schedule',coalesce((select jsonb_build_object('rehearsals',settings.rehearsal_schedule,'tech_and_dress',settings.tech_schedule,'performances_and_strike',settings.performance_schedule) from project_role_acceptance_settings settings where settings.project_id=f.project_id),'{}'::jsonb),
'sections',coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from audition_form_sections s where s.form_id=f.id),'[]'::jsonb),
'fields',coalesce((select jsonb_agg(to_jsonb(ff) order by ff.sort_order) from audition_form_fields ff where ff.form_id=f.id),'[]'::jsonb),
'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'role_group',r.role_group) order by r.role_group,r.name) from project_roles r where r.project_id=f.project_id and not exists(select 1 from role_assignments a where a.role_id=r.id and a.status not in('declined','withdrawn'))),'[]'::jsonb),
'sessions',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from audition_sessions x where x.project_id=f.project_id and x.is_published and (x.booking_opens_at is null or x.booking_opens_at<=now()) and (x.booking_closes_at is null or x.booking_closes_at>now())),'[]'::jsonb),
'slots',coalesce((select jsonb_agg(to_jsonb(sl)||jsonb_build_object('booked',(select count(*) from audition_submission_slots b join audition_submissions sub on sub.id=b.submission_id where b.slot_id=sl.id and sub.cancelled_at is null)) order by sl.starts_at) from audition_slots sl join audition_sessions sx on sx.id=sl.session_id where sx.project_id=f.project_id and sx.is_published and sl.status='open' and (sx.booking_opens_at is null or sx.booking_opens_at<=now()) and (sx.booking_closes_at is null or sx.booking_closes_at>now())),'[]'::jsonb))
from audition_forms f join projects p on p.id=f.project_id where f.public_token=form_token and f.status='published' and (f.closes_at is null or f.closes_at>now());$$;

create or replace function app_production_management.get_audition_form_preview(form_token uuid)
returns jsonb language sql stable security definer set search_path=app_production_management,public as $$
select jsonb_build_object('form',to_jsonb(f),'project',jsonb_build_object('id',p.id,'title',p.title),
'schedule',coalesce((select jsonb_build_object('rehearsals',settings.rehearsal_schedule,'tech_and_dress',settings.tech_schedule,'performances_and_strike',settings.performance_schedule) from project_role_acceptance_settings settings where settings.project_id=f.project_id),'{}'::jsonb),
'sections',coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from audition_form_sections s where s.form_id=f.id),'[]'::jsonb),
'fields',coalesce((select jsonb_agg(to_jsonb(ff) order by ff.sort_order) from audition_form_fields ff where ff.form_id=f.id),'[]'::jsonb),
'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'role_group',r.role_group) order by r.role_group,r.name) from project_roles r where r.project_id=f.project_id and not exists(select 1 from role_assignments a where a.role_id=r.id and a.status not in('declined','withdrawn'))),'[]'::jsonb),
'sessions',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from audition_sessions x where x.project_id=f.project_id and x.is_published),'[]'::jsonb),
'slots',coalesce((select jsonb_agg(to_jsonb(sl)||jsonb_build_object('booked',(select count(*) from audition_submission_slots b join audition_submissions sub on sub.id=b.submission_id where b.slot_id=sl.id and sub.cancelled_at is null)) order by sl.starts_at) from audition_slots sl join audition_sessions sx on sx.id=sl.session_id where sx.project_id=f.project_id and sx.is_published and sl.status='open'),'[]'::jsonb))
from audition_forms f join projects p on p.id=f.project_id where f.public_token=form_token and auth.uid() is not null and app_production_management.can_review_auditions(f.project_id);$$;

revoke all on function app_production_management.get_audition_form_preview(uuid) from public,anon;
grant execute on function app_production_management.get_audition_form_preview(uuid) to authenticated,service_role;
grant execute on function app_production_management.get_public_audition_form(uuid) to anon,authenticated;

commit;
