\set ON_ERROR_STOP on
\ir casting-offers-db-test.sql
\ir ../supabase/migrations/202609160500_rehearsal_conflicts.sql

insert into app_production_management.people(id,full_name) values('40000000-0000-4000-8000-000000000001','Conflict Test Actor');
insert into app_production_management.project_roles(id,project_id,name,role_group) values('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Ensemble','cast');
insert into app_production_management.project_role_acceptance_settings(project_id,rehearsal_schedule,tech_schedule,performance_schedule,expires_days) values('10000000-0000-4000-8000-000000000002','Weekly rehearsals','Tech','Performances',14);

set role authenticated;
set test.is_manager='true';
insert into app_production_management.project_conflict_windows(id,project_id,label,recurrence_type,day_of_week,starts_at,ends_at,call_type,max_call_minutes,collect_preferences,applies_to,required)
values('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Sunday rehearsal window','weekly',0,'10:00','18:00','flexible',240,true,'cast',true);
insert into app_production_management.casting_drafts(id,project_id,person_id,role_id)
values('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001');
select app_production_management.prepare_casting_offer('40000000-0000-4000-8000-000000000001',1) offer \gset
select public_token token from app_production_management.casting_offers where id=:'offer' \gset
select set_config('test.conflict_token',:'token',false);
reset role;

set role service_role;
do $$ declare tok uuid; begin
  tok:=current_setting('test.conflict_token')::uuid;
  begin
    perform app_production_management.respond_to_casting_offer(tok,'{"decision":"accepted","typed_name":"Conflict Test Actor","credit_choice":"0 credits","electronic_signature":true,"performance_available":true,"acknowledgements":{"privacy":true,"casting_attendance_policy":true},"conflict_windows":[]}');
    raise exception 'TEST FAILED required conflict window omitted';
  exception when raise_exception then if sqlerrm <> 'Answer every required rehearsal availability window.' then raise; end if; end;
  begin
    perform app_production_management.respond_to_casting_offer(tok,'{"decision":"accepted","typed_name":"Conflict Test Actor","credit_choice":"0 credits","electronic_signature":true,"performance_available":true,"acknowledgements":{"privacy":true,"casting_attendance_policy":true},"conflict_windows":[{"window_id":"40000000-0000-4000-8000-000000000001","availability":"unavailable","unavailable":[{"starts_at":"09:00","ends_at":"11:00","reason":"Outside"}],"preference_enabled":false,"preference_start":"","preference_end":"","preference_notes":""}]}');
    raise exception 'TEST FAILED out-of-window conflict accepted';
  exception when raise_exception then if sqlerrm <> 'Conflict times must stay inside their rehearsal window.' then raise; end if; end;
end $$;
select app_production_management.respond_to_casting_offer(:'token','{"decision":"accepted","typed_name":"Conflict Test Actor","credit_choice":"0 credits","electronic_signature":true,"performance_available":true,"acknowledgements":{"privacy":true,"casting_attendance_policy":true},"conflicts":"Sunday class","conflict_windows":[{"window_id":"40000000-0000-4000-8000-000000000001","availability":"unavailable","unavailable":[{"starts_at":"10:00","ends_at":"12:00","reason":"Class"}],"preference_enabled":true,"preference_start":"14:00","preference_end":"18:00","preference_notes":"Afternoon preferred"}]}');
reset role;

do $$ begin
  if (select jsonb_array_length(snapshot->'conflict_windows') from app_production_management.casting_offers where draft_id='40000000-0000-4000-8000-000000000001') <> 1 then raise exception 'TEST FAILED availability configuration not frozen into offer'; end if;
  if (select count(*) from app_production_management.rehearsal_conflict_responses where person_id='40000000-0000-4000-8000-000000000001') <> 1 then raise exception 'TEST FAILED structured response not persisted'; end if;
  if (select general_notes from app_production_management.rehearsal_conflict_responses where person_id='40000000-0000-4000-8000-000000000001') <> 'Sunday class' then raise exception 'TEST FAILED general conflict notes lost'; end if;
  if (select full_name from app_production_management.people where id='40000000-0000-4000-8000-000000000001') <> 'Conflict Test Actor' then raise exception 'TEST FAILED person record changed'; end if;
end $$;
select 'Rehearsal conflict snapshot, validation, and persistence assertions passed' result;
