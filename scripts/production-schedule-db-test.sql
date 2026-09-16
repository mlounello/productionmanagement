\set ON_ERROR_STOP on
\ir rehearsal-conflicts-db-test.sql
\ir ../supabase/migrations/202609160800_production_schedule_foundation.sql

set role authenticated;
set test.is_manager='true';
insert into app_production_management.project_conflict_windows(project_id,label,recurrence_type,event_date,starts_at,ends_at,call_type,applies_to,required,schedule_category,location,include_in_audition)
values
('10000000-0000-4000-8000-000000000002','Dress 1','date','2026-11-09','18:00','23:00','fixed','all',true,'dress','Studio Theatre',true),
('10000000-0000-4000-8000-000000000002','Opening Night','date','2026-11-12','18:00','23:00','fixed','all',true,'performance','Studio Theatre',true),
('10000000-0000-4000-8000-000000000002','Strike','date','2026-11-22','12:00','18:00','fixed','all',true,'strike','Studio Theatre',true);
reset role;

do $$ begin
  if not (select structured_schedule_enabled from app_production_management.project_role_acceptance_settings where project_id='10000000-0000-4000-8000-000000000002') then raise exception 'TEST FAILED structured schedule not activated'; end if;
  if (select tech_schedule from app_production_management.project_role_acceptance_settings where project_id='10000000-0000-4000-8000-000000000002') not like 'Dress 1:%' then raise exception 'TEST FAILED tech/dress display not generated'; end if;
  if (select performance_schedule from app_production_management.project_role_acceptance_settings where project_id='10000000-0000-4000-8000-000000000002') not like '%Strike:%' then raise exception 'TEST FAILED performance/strike display not generated'; end if;
  if (select rehearsal_schedule from app_production_management.project_role_acceptance_settings where project_id='10000000-0000-4000-8000-000000000002') not like 'Sundays:%' then raise exception 'TEST FAILED recurring rehearsal display not generated'; end if;
end $$;

insert into app_production_management.rehearsal_conflict_responses(project_id,person_id,source_type,source_id,windows_snapshot,responses)
values('10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','audition_submission','50000000-0000-4000-8000-000000000001','[]','[]');

select 'Production schedule classification, generated display, and audition conflict persistence assertions passed' result;
