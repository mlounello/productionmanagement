\set ON_ERROR_STOP on
\ir rehearsal-conflicts-db-test.sql

create table app_production_management.audition_submissions(
  id uuid primary key, project_id uuid not null, person_id uuid, cancelled_at timestamptz,
  casting_status text not null default 'not_reviewed'
);
create table app_production_management.audition_reviews(
  id uuid primary key default gen_random_uuid(), submission_id uuid not null,
  reviewer_user_id uuid not null, recommendation text not null default '', rubric jsonb not null default '{}',
  updated_at timestamptz not null default now(), unique(submission_id,reviewer_user_id)
);
create table app_production_management.audition_character_reads(submission_id uuid not null,project_role_id uuid not null,marked_by uuid,unique(submission_id,project_role_id));
create function app_production_management.can_manage_auditions(uuid) returns boolean language sql stable as $$ select coalesce(current_setting('test.is_manager',true),'false')='true' $$;
grant select,insert,update on app_production_management.audition_submissions,app_production_management.audition_reviews to authenticated;
\ir ../supabase/migrations/202609160700_audition_room_casting_bridge.sql

insert into app_production_management.people(id,full_name) values('50000000-0000-4000-8000-000000000001','Bridge Test Actor');
insert into app_production_management.project_roles(id,project_id,name,role_group) values('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Mark Cohen','cast');
insert into app_production_management.project_roles(id,project_id,name,role_group) values('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Ensemble','cast');
insert into app_production_management.audition_submissions(id,project_id,person_id) values('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001');

set role authenticated;set test.is_manager='true';
select app_production_management.sync_audition_room_casting('10000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001','cast',array['50000000-0000-4000-8000-000000000001'::uuid,'50000000-0000-4000-8000-000000000002'::uuid]);
reset role;
do $$ begin
  if (select casting_status from app_production_management.audition_submissions where id='50000000-0000-4000-8000-000000000001')<>'cast' then raise exception 'TEST FAILED audition not marked cast';end if;
  if (select room_recommendation from app_production_management.audition_submissions where id='50000000-0000-4000-8000-000000000001')<>'cast' then raise exception 'TEST FAILED shared room decision not saved';end if;
  if (select count(*) from app_production_management.casting_drafts where source_audition_submission_id='50000000-0000-4000-8000-000000000001' and status='draft')<>2 then raise exception 'TEST FAILED one draft per selected role not created';end if;
end $$;
set role authenticated;set test.is_manager='true';
select app_production_management.sync_audition_room_casting('10000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001','cast',array['50000000-0000-4000-8000-000000000001'::uuid]);
reset role;
do $$ begin
  if (select count(*) from app_production_management.casting_drafts where source_audition_submission_id='50000000-0000-4000-8000-000000000001' and status='draft')<>1 then raise exception 'TEST FAILED unchecked role draft not withdrawn';end if;
end $$;
set role authenticated;set test.is_manager='true';
select app_production_management.sync_audition_room_casting('10000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001','consider','{}'::uuid[]);
reset role;
do $$ begin
  if (select casting_status from app_production_management.audition_submissions where id='50000000-0000-4000-8000-000000000001')<>'considering' then raise exception 'TEST FAILED audition decision not reverted';end if;
  if exists(select 1 from app_production_management.casting_drafts where source_audition_submission_id='50000000-0000-4000-8000-000000000001' and status<>'withdrawn') then raise exception 'TEST FAILED automatic drafts not withdrawn';end if;
end $$;
select 'Audition Room casting bridge assertions passed' result;
