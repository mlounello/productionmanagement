begin;

create table app_production_management.casting_offers (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references app_production_management.casting_drafts(id) on delete restrict,
  project_id uuid not null references app_production_management.projects(id) on delete cascade,
  draft_revision integer not null,
  template_id uuid not null references app_production_management.role_acceptance_templates(id) on delete restrict,
  public_token uuid not null unique default gen_random_uuid(),
  snapshot jsonb not null,
  status text not null default 'prepared' check(status in ('prepared','accepted','declined','discussion','superseded')),
  answers jsonb not null default '{}',
  expires_at timestamptz not null,
  responded_at timestamptz,
  released_at timestamptz,
  released_by uuid references auth.users(id) on delete set null,
  acceptance_request_id uuid references app_production_management.role_acceptance_requests(id) on delete restrict,
  onboarding_status text not null default 'not_started' check(onboarding_status in ('not_started','pending','complete','attention')),
  onboarding_error text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(draft_id,draft_revision),
  check (released_at is null or (status='accepted' and acceptance_request_id is not null))
);
create index casting_offers_project on app_production_management.casting_offers(project_id,created_at);
alter table app_production_management.casting_offers enable row level security;
create policy "managers read casting offers" on app_production_management.casting_offers for select to authenticated
using(app_production_management.has_app_role(array['admin','producer']) or app_production_management.has_project_role(project_id,array['project_manager','producer']));
grant select on app_production_management.casting_offers to authenticated,service_role;
grant update(onboarding_status,onboarding_error) on app_production_management.casting_offers to service_role;

create table app_production_management.casting_offer_events (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references app_production_management.casting_offers(id) on delete restrict,
  project_id uuid not null references app_production_management.projects(id) on delete cascade,
  event text not null,
  details jsonb not null,
  created_at timestamptz not null default now()
);
alter table app_production_management.casting_offer_events enable row level security;
create policy "managers read casting history" on app_production_management.casting_offer_events for select to authenticated
using(app_production_management.has_app_role(array['admin','producer']) or app_production_management.has_project_role(project_id,array['project_manager','producer']));
grant select on app_production_management.casting_offer_events to authenticated,service_role;
create function app_production_management.record_casting_offer_event() returns trigger
language plpgsql security definer set search_path=app_production_management,pg_temp as $$
begin
  insert into casting_offer_events(offer_id,project_id,event,details)
  values(new.id,new.project_id,case when new.released_at is not null then 'released' else new.status end,
    jsonb_build_object('answers',new.answers,'responded_at',new.responded_at,'released_by',new.released_by));
  return new;
end $$;
create trigger record_casting_offer_event after insert or update of status,released_at on app_production_management.casting_offers
for each row execute function app_production_management.record_casting_offer_event();

create or replace function app_production_management.invalidate_casting_offers()
returns trigger language plpgsql security definer set search_path=app_production_management,pg_temp as $$
begin
  if exists(select 1 from casting_offers where draft_id=old.id and released_at is not null) then
    raise exception 'This offer has been released. Manage the official assignment in Roles & Assignments.';
  end if;
  update casting_offers set status='superseded' where draft_id=old.id and status <> 'superseded';
  return new;
end $$;
create trigger invalidate_casting_offers before update on app_production_management.casting_drafts
for each row execute function app_production_management.invalidate_casting_offers();

create or replace function app_production_management.prepare_casting_offer(target_draft uuid, expected_revision integer)
returns uuid language plpgsql security definer set search_path=app_production_management,pg_temp as $$
declare
  d casting_drafts; r project_roles; t role_acceptance_templates; s project_role_acceptance_settings;
  offer_id uuid; agreement_type text; sections jsonb; actor_name text; project_title text;
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
  select full_name into actor_name from people where id=d.person_id;
  select title into project_title from projects where id=d.project_id;
  insert into casting_offers(draft_id,project_id,draft_revision,template_id,created_by,expires_at,snapshot)
  values(d.id,d.project_id,d.revision,t.id,auth.uid(),now()+make_interval(days=>coalesce(s.expires_days,14)),
    jsonb_build_object('name',t.name,'type',agreement_type,'version',t.version,'person_name',actor_name,'project_title',project_title,'role_name',r.name,
      'introduction',coalesce(nullif(case when agreement_type='cast' then s.cast_introduction else s.crew_introduction end,''),t.introduction),
      'sections',sections,'credit_options',jsonb_build_array('0 credits','1 credit','2 credits','3 credits','Not sure yet — I would like guidance'),
      'coverage_type',d.coverage_type,'covered_roles',coalesce((select jsonb_agg(name order by name) from project_roles where id=any(d.covered_role_ids)),'[]'::jsonb),
      'additional_duties',d.additional_duties,'actor_notes',d.actor_notes,
      'schedule',jsonb_build_object('rehearsals',case when agreement_type='cast' then s.rehearsal_schedule else '' end,'tech_and_dress',s.tech_schedule,'performances_and_strike',s.performance_schedule))) returning id into offer_id;
  return offer_id;
end $$;

create or replace function app_production_management.respond_to_casting_offer(offer_token uuid, response jsonb)
returns text language plpgsql security definer set search_path=app_production_management,pg_temp as $$
declare o casting_offers; d casting_drafts; decision text; section jsonb;
begin
  -- Lock draft first, matching prepare/release/edit, to serialize supersession.
  select cd.* into d from casting_drafts cd join casting_offers co on co.draft_id=cd.id where co.public_token=offer_token for update of cd;
  select * into o from casting_offers where public_token=offer_token for update;
  if o.id is null or o.status='superseded' or d.status <> 'draft' or d.revision <> o.draft_revision then raise exception 'This offer is no longer current. Contact production management.'; end if;
  if o.status in ('accepted','declined') then return o.status; end if;
  if o.expires_at <= now() then raise exception 'This offer has expired. Contact production management.'; end if;
  decision := response->>'decision';
  if decision is null or decision not in ('accepted','declined','discussion') then raise exception 'Choose a response.'; end if;
  if length(trim(coalesce(response->>'typed_name',''))) not between 2 and 180 then raise exception 'Enter your full name.'; end if;
  if octet_length(response::text)>40000 then raise exception 'Response is too long.'; end if;
  if decision='accepted' then
    if not coalesce((o.snapshot->'credit_options') ? (response->>'credit_choice'),false) then raise exception 'Choose your anticipated credits.'; end if;
    if response->>'performance_available' is distinct from 'true' then raise exception 'Confirm availability for every performance or request a discussion.'; end if;
    if response->>'electronic_signature' is distinct from 'true' then raise exception 'Confirm your electronic signature.'; end if;
    for section in select value from jsonb_array_elements(o.snapshot->'sections') loop
      if section->>'requires_response'='true' and response->'acknowledgements'->>(section->>'key') is distinct from 'true' then raise exception 'Acknowledge every required agreement section.'; end if;
    end loop;
  end if;
  update casting_offers set status=decision,answers=response,responded_at=now() where id=o.id;
  return decision;
end $$;

create or replace function app_production_management.release_casting_offer(target_offer uuid)
returns jsonb language plpgsql security definer set search_path=app_production_management,pg_temp as $$
declare o casting_offers; d casting_drafts; assignment_id uuid; request_id uuid;
begin
  select cd.* into d from casting_drafts cd join casting_offers co on co.draft_id=cd.id where co.id=target_offer for update of cd;
  select * into o from casting_offers where id=target_offer for update;
  if o.id is null or not coalesce(has_app_role(array['admin','producer']) or has_project_role(o.project_id,array['project_manager','producer']),false) then raise exception 'Casting manager access required.'; end if;
  if o.released_at is not null then return jsonb_build_object('request_id',o.acceptance_request_id,'newly_released',false); end if;
  if o.status <> 'accepted' or d.status <> 'draft' or d.revision <> o.draft_revision then raise exception 'Only a current accepted offer can be released.'; end if;
  -- Existing capacity trigger serializes claims on each role. Never upsert over
  -- an existing assignment or another actor; an entire failed release rolls back.
  insert into role_assignments(project_id,role_id,person_id,status,confirmation_status,acceptance_required,onboarding_status,assignment_kind)
  values(d.project_id,d.role_id,d.person_id,'accepted','accepted',true,'onboarding','primary') returning id into assignment_id;
  insert into role_acceptance_requests(project_id,role_assignment_id,person_id,template_id,status,template_snapshot,answers,submitted_at,accepted_at,created_by)
  values(d.project_id,assignment_id,d.person_id,o.template_id,'accepted',o.snapshot,o.answers,o.responded_at,o.responded_at,auth.uid()) returning id into request_id;
  update casting_offers set released_at=now(),released_by=auth.uid(),acceptance_request_id=request_id,onboarding_status='pending' where id=o.id;
  return jsonb_build_object('request_id',request_id,'newly_released',true);
end $$;

revoke all on function app_production_management.prepare_casting_offer(uuid,integer) from public;
revoke all on function app_production_management.respond_to_casting_offer(uuid,jsonb) from public;
revoke all on function app_production_management.release_casting_offer(uuid) from public;
grant execute on function app_production_management.prepare_casting_offer(uuid,integer),app_production_management.release_casting_offer(uuid) to authenticated;
grant execute on function app_production_management.respond_to_casting_offer(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
