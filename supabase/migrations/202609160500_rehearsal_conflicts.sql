begin;

-- Project-owned availability windows are reusable by casting, direct role
-- acceptance, stage management, and a future rehearsal/calendar module.
create table app_production_management.project_conflict_windows (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 160),
  recurrence_type text not null default 'weekly' check (recurrence_type in ('weekly','date')),
  day_of_week smallint check (day_of_week between 0 and 6),
  event_date date,
  starts_at time not null,
  ends_at time not null,
  call_type text not null default 'fixed' check (call_type in ('fixed','flexible')),
  max_call_minutes smallint check (max_call_minutes between 15 and 720),
  collect_preferences boolean not null default false,
  applies_to text not null default 'cast' check (applies_to in ('cast','crew','all')),
  required boolean not null default true,
  instructions text not null default '' check (char_length(instructions) <= 2000),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((recurrence_type='weekly' and day_of_week is not null and event_date is null)
      or (recurrence_type='date' and event_date is not null and day_of_week is null)),
  check ((call_type='fixed' and max_call_minutes is null)
      or (call_type='flexible' and max_call_minutes is not null
        and max_call_minutes <= extract(epoch from (ends_at-starts_at))/60))
);
create index project_conflict_windows_project on app_production_management.project_conflict_windows(project_id,active,sort_order);

create table app_production_management.rehearsal_conflict_responses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects(id) on delete cascade,
  person_id uuid not null references app_production_management.people(id) on delete cascade,
  source_type text not null check (source_type in ('casting_offer','role_acceptance','manual')),
  source_id uuid not null,
  windows_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(windows_snapshot)='array'),
  responses jsonb not null default '[]'::jsonb check (jsonb_typeof(responses)='array'),
  general_notes text not null default '' check (char_length(general_notes) <= 6000),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_type,source_id)
);
create index rehearsal_conflict_responses_project on app_production_management.rehearsal_conflict_responses(project_id,submitted_at desc);
create index rehearsal_conflict_responses_person on app_production_management.rehearsal_conflict_responses(person_id,project_id);
create index rehearsal_conflict_responses_json on app_production_management.rehearsal_conflict_responses using gin(responses jsonb_path_ops);

alter table app_production_management.project_conflict_windows enable row level security;
alter table app_production_management.rehearsal_conflict_responses enable row level security;

create policy "project staff read conflict windows" on app_production_management.project_conflict_windows for select to authenticated
using(app_production_management.has_app_role(array['admin','producer']) or app_production_management.has_project_role(project_id,array['project_manager','producer','department_head','staff']));
create policy "managers manage conflict windows" on app_production_management.project_conflict_windows for all to authenticated
using(app_production_management.has_app_role(array['admin','producer']) or app_production_management.has_project_role(project_id,array['project_manager','producer']))
with check(app_production_management.has_app_role(array['admin','producer']) or app_production_management.has_project_role(project_id,array['project_manager','producer']));
create policy "project staff read conflict responses" on app_production_management.rehearsal_conflict_responses for select to authenticated
using(app_production_management.has_app_role(array['admin','producer']) or app_production_management.has_project_role(project_id,array['project_manager','producer','department_head','staff']));
create policy "managers manage manual conflict responses" on app_production_management.rehearsal_conflict_responses for all to authenticated
using(source_type='manual' and (app_production_management.has_app_role(array['admin','producer']) or app_production_management.has_project_role(project_id,array['project_manager','producer'])))
with check(source_type='manual' and (app_production_management.has_app_role(array['admin','producer']) or app_production_management.has_project_role(project_id,array['project_manager','producer'])));

grant select,insert,update on app_production_management.project_conflict_windows to authenticated,service_role;
grant select on app_production_management.rehearsal_conflict_responses to authenticated;
grant select,insert,update on app_production_management.rehearsal_conflict_responses to service_role;

create or replace function app_production_management.stamp_conflict_window()
returns trigger language plpgsql set search_path=app_production_management,pg_temp as $$
begin
  if tg_op='INSERT' then new.created_by:=auth.uid(); new.created_at:=now(); end if;
  new.updated_by:=auth.uid(); new.updated_at:=now();
  return new;
end $$;
create trigger stamp_conflict_window before insert or update on app_production_management.project_conflict_windows
for each row execute function app_production_management.stamp_conflict_window();

-- Freeze the current conflict configuration into each new offer. A later
-- project edit never silently changes an agreement already sent to an actor.
create or replace function app_production_management.prepare_casting_offer(target_draft uuid, expected_revision integer)
returns uuid language plpgsql security definer set search_path=app_production_management,pg_temp as $$
declare
  d casting_drafts; r project_roles; t role_acceptance_templates; s project_role_acceptance_settings;
  offer_id uuid; agreement_type text; sections jsonb; actor_name text; project_title text; conflict_windows jsonb;
begin
  select * into d from casting_drafts where id=target_draft for update;
  if d.id is null or not coalesce(has_app_role(array['admin','producer']) or has_project_role(d.project_id,array['project_manager','producer']),false) then raise exception 'Casting manager access required.'; end if;
  if d.status <> 'draft' or d.revision <> expected_revision then raise exception 'The draft changed. Reload before preparing the offer.'; end if;
  select id into offer_id from casting_offers where draft_id=d.id and draft_revision=d.revision;
  if offer_id is not null then return offer_id; end if;
  select * into r from project_roles where id=d.role_id;
  if exists(select 1 from role_assignments where role_id=d.role_id and person_id=d.person_id and status not in ('declined','withdrawn')) then raise exception 'This person already has this role. Review their existing assignment.'; end if;
  agreement_type := case when r.role_group='cast' then 'cast' else 'crew' end;
  select * into t from role_acceptance_templates where template_type=agreement_type and active order by version desc limit 1;
  if t.id is null then raise exception 'Configure an active acceptance template first.'; end if;
  select * into s from project_role_acceptance_settings where project_id=d.project_id;
  if coalesce(trim(s.tech_schedule),'')='' or coalesce(trim(s.performance_schedule),'')='' or (agreement_type='cast' and coalesce(trim(s.rehearsal_schedule),'')='') then raise exception 'Complete the project agreement schedules before preparing offers.'; end if;
  sections := coalesce(case when agreement_type='cast' then s.cast_sections else s.crew_sections end,t.sections,'[]'::jsonb);
  if agreement_type='cast' then
    sections := sections || jsonb_build_array(jsonb_build_object('key','casting_attendance_policy','title','Attendance policy','body','Three unexcused absences may result in removal from the production. Each unexcused late arrival counts as one unexcused absence.','acknowledgement','I understand and agree to the attendance policy.','requires_response',true));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'label',label,'recurrence_type',recurrence_type,'day_of_week',day_of_week,'event_date',event_date,
    'starts_at',starts_at,'ends_at',ends_at,'call_type',call_type,'max_call_minutes',max_call_minutes,
    'collect_preferences',collect_preferences,'applies_to',applies_to,'required',required,'instructions',instructions
  ) order by sort_order,label),'[]'::jsonb) into conflict_windows
  from project_conflict_windows where project_id=d.project_id and active and applies_to in (agreement_type,'all');
  select full_name into actor_name from people where id=d.person_id;
  select title into project_title from projects where id=d.project_id;
  insert into casting_offers(draft_id,project_id,draft_revision,template_id,created_by,expires_at,snapshot)
  values(d.id,d.project_id,d.revision,t.id,auth.uid(),now()+make_interval(days=>coalesce(s.expires_days,14)),
    jsonb_build_object('name',t.name,'type',agreement_type,'version',t.version,'person_name',actor_name,'project_title',project_title,'role_name',r.name,
      'introduction',coalesce(nullif(case when agreement_type='cast' then s.cast_introduction else s.crew_introduction end,''),t.introduction),
      'sections',sections,'credit_options',jsonb_build_array('0 credits','1 credit','2 credits','3 credits','Not sure yet — I would like guidance'),
      'coverage_type',d.coverage_type,'covered_roles',coalesce((select jsonb_agg(name order by name) from project_roles where id=any(d.covered_role_ids)),'[]'::jsonb),
      'additional_duties',d.additional_duties,'actor_notes',d.actor_notes,'conflict_windows',conflict_windows,
      'schedule',jsonb_build_object('rehearsals',case when agreement_type='cast' then s.rehearsal_schedule else '' end,'tech_and_dress',s.tech_schedule,'performances_and_strike',s.performance_schedule))) returning id into offer_id;
  return offer_id;
end $$;

create or replace function app_production_management.respond_to_casting_offer(offer_token uuid, response jsonb)
returns text language plpgsql security definer set search_path=app_production_management,pg_temp as $$
declare o casting_offers; d casting_drafts; decision text; section jsonb; conflict_window jsonb; answer jsonb; interval jsonb; response_id uuid;
begin
  select cd.* into d from casting_drafts cd join casting_offers co on co.draft_id=cd.id where co.public_token=offer_token for update of cd;
  select * into o from casting_offers where public_token=offer_token for update;
  if o.id is null or o.status='superseded' or d.status <> 'draft' or d.revision <> o.draft_revision then raise exception 'This offer is no longer current. Contact production management.'; end if;
  if o.status in ('accepted','declined') then return o.status; end if;
  if o.expires_at <= now() then raise exception 'This offer has expired. Contact production management.'; end if;
  decision := response->>'decision';
  if decision is null or decision not in ('accepted','declined','discussion') then raise exception 'Choose a response.'; end if;
  if length(trim(coalesce(response->>'typed_name',''))) not between 2 and 180 then raise exception 'Enter your full name.'; end if;
  if octet_length(response::text)>100000 then raise exception 'Response is too long.'; end if;
  if decision='accepted' then
    if not coalesce((o.snapshot->'credit_options') ? (response->>'credit_choice'),false) then raise exception 'Choose your anticipated credits.'; end if;
    if response->>'performance_available' is distinct from 'true' then raise exception 'Confirm availability for every performance or request a discussion.'; end if;
    if response->>'electronic_signature' is distinct from 'true' then raise exception 'Confirm your electronic signature.'; end if;
    for section in select value from jsonb_array_elements(o.snapshot->'sections') loop
      if section->>'requires_response'='true' and response->'acknowledgements'->>(section->>'key') is distinct from 'true' then raise exception 'Acknowledge every required agreement section.'; end if;
    end loop;
    for conflict_window in select value from jsonb_array_elements(coalesce(o.snapshot->'conflict_windows','[]'::jsonb)) loop
      select value into answer from jsonb_array_elements(coalesce(response->'conflict_windows','[]'::jsonb)) where value->>'window_id'=conflict_window->>'id' limit 1;
      if conflict_window->>'required'='true' and (answer is null or answer->>'availability' not in ('available','unavailable')) then raise exception 'Answer every required rehearsal availability window.'; end if;
      if answer is not null and answer->>'availability'='unavailable' and jsonb_array_length(coalesce(answer->'unavailable','[]'::jsonb))=0 then raise exception 'Add at least one unavailable time for each conflict.'; end if;
      if answer is not null then
        for interval in select value from jsonb_array_elements(coalesce(answer->'unavailable','[]'::jsonb)) loop
          if coalesce(interval->>'starts_at','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(interval->>'ends_at','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            or (interval->>'starts_at')::time < (conflict_window->>'starts_at')::time or (interval->>'ends_at')::time > (conflict_window->>'ends_at')::time
            or (interval->>'ends_at')::time <= (interval->>'starts_at')::time then raise exception 'Conflict times must stay inside their rehearsal window.'; end if;
        end loop;
        if coalesce(answer->>'preference_enabled','false')='true' then
          if conflict_window->>'collect_preferences'<>'true' then raise exception 'A preference was submitted for a window that does not collect preferences.'; end if;
          if coalesce(answer->>'preference_start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(answer->>'preference_end','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            or (answer->>'preference_start')::time < (conflict_window->>'starts_at')::time or (answer->>'preference_end')::time > (conflict_window->>'ends_at')::time
            or (answer->>'preference_end')::time <= (answer->>'preference_start')::time then raise exception 'Preferred times must stay inside their rehearsal window.'; end if;
        end if;
      end if;
    end loop;
  end if;
  update casting_offers set status=decision,answers=response,responded_at=now() where id=o.id;
  if decision='accepted' then
    insert into rehearsal_conflict_responses(project_id,person_id,source_type,source_id,windows_snapshot,responses,general_notes,submitted_at,updated_at)
    values(o.project_id,d.person_id,'casting_offer',o.id,coalesce(o.snapshot->'conflict_windows','[]'::jsonb),coalesce(response->'conflict_windows','[]'::jsonb),coalesce(response->>'conflicts',''),now(),now())
    on conflict(source_type,source_id) do update set windows_snapshot=excluded.windows_snapshot,responses=excluded.responses,general_notes=excluded.general_notes,submitted_at=excluded.submitted_at,updated_at=now()
    returning id into response_id;
  end if;
  return decision;
end $$;

revoke all on function app_production_management.prepare_casting_offer(uuid,integer) from public;
revoke all on function app_production_management.respond_to_casting_offer(uuid,jsonb) from public;
grant execute on function app_production_management.prepare_casting_offer(uuid,integer) to authenticated;
grant execute on function app_production_management.respond_to_casting_offer(uuid,jsonb) to service_role;

notify pgrst,'reload schema';
commit;
