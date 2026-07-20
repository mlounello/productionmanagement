begin;

-- Validate both legacy same-day dependencies and explicit source-session to
-- destination-session maps inside the authoritative public submission RPC.
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
  source_session audition_sessions;
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
  dependency_key text;
  dependency_filter text;
  allowed_sessions jsonb;
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
    dependency_key:=coalesce(booking_field.settings->>'same_day_as','');
    if dependency_key<>'' then
      if not booking_payload ? dependency_key then raise exception 'Choose the prerequisite audition booking first.'; end if;
      select * into target_slot from audition_slots where id=booking.slot_id;
      select * into target_session from audition_sessions where id=target_slot.session_id;
      select sx.* into source_session from audition_sessions sx join audition_slots sl on sl.session_id=sx.id where sl.id=(booking_payload->>dependency_key)::uuid;
      dependency_filter:=coalesce(nullif(booking_field.settings->>'dependency_filter',''),'same_day');
      if dependency_filter='mapped_sessions' then
        allowed_sessions:=booking_field.settings->'session_map'->(source_session.id::text);
        if coalesce(jsonb_typeof(allowed_sessions),'')<>'array' or not (allowed_sessions ? target_session.id::text) then
          raise exception 'That audition time is not available for the prerequisite booking selected.';
        end if;
      elsif (target_slot.starts_at at time zone 'America/New_York')::date<>
        ((select sl.starts_at from audition_slots sl where sl.id=(booking_payload->>dependency_key)::uuid) at time zone 'America/New_York')::date then
        raise exception 'Linked audition requirements must be booked on the same day.';
      end if;
    end if;
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

commit;
