\set ON_ERROR_STOP on
\pset pager off

begin;

create temporary table audition_hotfix_baseline as
select
  (select count(*) from app_production_management.projects) as project_count,
  (select count(*) from app_production_management.audition_sessions) as session_count,
  (select count(*) from app_production_management.audition_slots) as slot_count,
  (select count(*) from app_production_management.audition_submissions) as submission_count,
  (select count(*) from app_production_management.audition_submission_slots) as booking_count;

\ir ../supabase/migrations/202607232000_audition_operations_hotfix.sql

do $test$
declare
  before_record audition_hotfix_baseline%rowtype;
  after_record audition_hotfix_baseline%rowtype;
begin
  if not has_table_privilege(
    'service_role',
    'app_production_management.audition_sessions',
    'select'
  ) then
    raise exception 'Calendar service cannot read audition sessions.';
  end if;

  if not has_table_privilege(
    'service_role',
    'app_production_management.audition_slots',
    'select, update'
  ) then
    raise exception 'Calendar service is missing required audition-slot access.';
  end if;

  select * into strict before_record from audition_hotfix_baseline;
  select
    (select count(*) from app_production_management.projects),
    (select count(*) from app_production_management.audition_sessions),
    (select count(*) from app_production_management.audition_slots),
    (select count(*) from app_production_management.audition_submissions),
    (select count(*) from app_production_management.audition_submission_slots)
  into strict after_record;

  if row(before_record.*) is distinct from row(after_record.*) then
    raise exception 'Protected Production Management counts changed during rehearsal.';
  end if;
end;
$test$;

select
  'audition_operations_hotfix_rehearsal_passed' as result,
  project_count,
  session_count,
  slot_count,
  submission_count,
  booking_count
from audition_hotfix_baseline;

rollback;
