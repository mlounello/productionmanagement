\set ON_ERROR_STOP on
\ir casting-drafts-db-test.sql
-- Extend only the disposable fixtures with the legacy acceptance interfaces.
alter table app_production_management.projects add title text default 'Test production';
alter table app_production_management.project_roles add name text default 'Ensemble';
alter table app_production_management.project_roles add role_group text default 'cast';
create table app_production_management.role_acceptance_templates(id uuid primary key,template_type text,active boolean,version integer,name text,sections jsonb,introduction text);
create table app_production_management.project_role_acceptance_settings(project_id uuid primary key,cast_sections jsonb,crew_sections jsonb,cast_introduction text,crew_introduction text,rehearsal_schedule text,tech_schedule text,performance_schedule text,expires_days integer);
create table app_production_management.role_assignments(id uuid primary key default gen_random_uuid(),project_id uuid,role_id uuid,person_id uuid,status text,confirmation_status text,acceptance_required boolean,onboarding_status text,assignment_kind text,unique(role_id,person_id));
create table app_production_management.role_acceptance_requests(id uuid primary key default gen_random_uuid(),project_id uuid,role_assignment_id uuid unique,person_id uuid,template_id uuid,status text,template_snapshot jsonb,answers jsonb,submitted_at timestamptz,accepted_at timestamptz,created_by uuid);
insert into app_production_management.role_acceptance_templates values('10000000-0000-4000-8000-000000000001','cast',true,1,'Actor agreement','[{"key":"privacy","title":"Privacy","body":"Keep rehearsals private","acknowledgement":"I agree","requires_response":true}]','Welcome');
insert into app_production_management.project_role_acceptance_settings(project_id,rehearsal_schedule,tech_schedule,performance_schedule,expires_days) values('10000000-0000-4000-8000-000000000001','Monday rehearsal','Tech date','Opening performance',14);
\ir ../supabase/migrations/202609160200_casting_offer_responses.sql
set role authenticated;
set test.is_manager='true';
select app_production_management.prepare_casting_offer('10000000-0000-4000-8000-000000000001',3) as offer_id \gset
select public_token as token from app_production_management.casting_offers where id=:'offer_id' \gset
-- The manager API cannot forge a student's public response.
do $$ begin
  begin perform app_production_management.respond_to_casting_offer(gen_random_uuid(),'{}'); raise exception 'TEST FAILED manager response RPC access';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ declare tok uuid; begin
  select public_token into tok from app_production_management.casting_offers limit 1;
  begin
    perform app_production_management.respond_to_casting_offer(tok,'{"decision":"accepted","typed_name":"Test Actor","credit_choice":"0 credits","electronic_signature":true,"performance_available":true,"acknowledgements":{}}');
    raise exception 'TEST FAILED missing acknowledgements accepted';
  exception when raise_exception then if sqlerrm <> 'Acknowledge every required agreement section.' then raise; end if; end;
  if exists(select 1 from app_production_management.role_assignments) then raise exception 'TEST FAILED assignment before release'; end if;
end $$;
grant usage on schema app_production_management to service_role;
set role service_role;
select app_production_management.respond_to_casting_offer(:'token','{"decision":"discussion","typed_name":"Test Actor","comments":"Can we discuss?"}');
select app_production_management.respond_to_casting_offer(:'token','{"decision":"accepted","typed_name":"Test Actor","credit_choice":"0 credits","electronic_signature":true,"performance_available":true,"acknowledgements":{"privacy":true,"casting_attendance_policy":true}}');
reset role;
do $$ begin
  if exists(select 1 from app_production_management.role_assignments) then raise exception 'TEST FAILED acceptance started onboarding'; end if;
  if (select count(*) from app_production_management.casting_offer_events where event='discussion') <> 1 then raise exception 'TEST FAILED discussion history lost'; end if;
end $$;
set role authenticated;
set test.is_manager='true';
-- Revision invalidates the old signature and secure link, never deleting it.
update app_production_management.casting_drafts set actor_notes='Revised role duties';
select app_production_management.prepare_casting_offer('10000000-0000-4000-8000-000000000001',4) as new_offer \gset
select public_token as new_token from app_production_management.casting_offers where id=:'new_offer' \gset
reset role;
do $$ declare old_token uuid; begin
  select public_token into old_token from app_production_management.casting_offers where status='superseded';
  begin perform app_production_management.respond_to_casting_offer(old_token,'{"decision":"declined","typed_name":"Test Actor"}'); raise exception 'TEST FAILED old link accepted';
  exception when raise_exception then if sqlerrm <> 'This offer is no longer current. Contact production management.' then raise; end if; end;
end $$;
select app_production_management.respond_to_casting_offer(:'new_token','{"decision":"accepted","typed_name":"Test Actor","credit_choice":"2 credits","electronic_signature":true,"performance_available":true,"acknowledgements":{"privacy":true,"casting_attendance_policy":true}}');
set role authenticated;
set test.is_manager='false';
do $$ begin
  if exists(select 1 from app_production_management.casting_offers) then raise exception 'TEST FAILED offers exposed'; end if;
end $$;
set test.is_manager='true';
select app_production_management.release_casting_offer(:'new_offer');
select app_production_management.release_casting_offer(:'new_offer');
reset role;
do $$ begin
  if (select count(*) from app_production_management.role_assignments) <> 1 then raise exception 'TEST FAILED duplicate/missing assignment'; end if;
  if (select count(*) from app_production_management.role_acceptance_requests) <> 1 then raise exception 'TEST FAILED duplicate/missing agreement'; end if;
  if (select count(*) from app_production_management.casting_offer_events where event='released') <> 1 then raise exception 'TEST FAILED duplicate release'; end if;
  if (select full_name from app_production_management.people limit 1) <> 'Preserved Actor' then raise exception 'TEST FAILED actor overwritten'; end if;
  if (select count(*) from app_production_management.casting_offers) <> 2 then raise exception 'TEST FAILED previous signature lost'; end if;
end $$;
select 'Casting acceptance and release assertions passed' as result;
