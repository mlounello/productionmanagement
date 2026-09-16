begin;

-- The existing conflict windows already contain the scheduling primitives we
-- need (date/weekday, start/end, audience, flexibility, and snapshot safety).
-- Classify those records so they become the canonical production schedule
-- without copying or deleting any existing project data.
alter table app_production_management.project_conflict_windows
  add column if not exists schedule_category text not null default 'rehearsal'
    check (schedule_category in ('rehearsal','designer_run','tech','dress','photo_call','performance','strike','other')),
  add column if not exists location text not null default '' check (char_length(location) <= 500),
  add column if not exists include_in_audition boolean not null default true;
alter table app_production_management.project_role_acceptance_settings
  add column if not exists structured_schedule_enabled boolean not null default false;

comment on table app_production_management.project_conflict_windows is
  'Canonical structured production schedule. Recurring rehearsal rules and dated production calls are frozen into audition and agreement snapshots.';

-- Audition submissions now participate in the same append-only conflict
-- history as signed casting offers. Existing response rows are unchanged.
alter table app_production_management.rehearsal_conflict_responses
  drop constraint if exists rehearsal_conflict_responses_source_type_check;
alter table app_production_management.rehearsal_conflict_responses
  add constraint rehearsal_conflict_responses_source_type_check
  check (source_type in ('audition_submission','casting_offer','role_acceptance','manual'));

-- Rebuild the display-only legacy schedule text from the structured source.
-- This preserves every existing consumer while removing duplicate editing.
create or replace function app_production_management.refresh_project_schedule_text(target_project_id uuid)
returns void language plpgsql security definer
set search_path=app_production_management,pg_temp as $$
declare rehearsal_text text; tech_text text; performance_text text; managed boolean;
begin
  select string_agg(
    case when recurrence_type='weekly' then
      trim(to_char(date '2023-01-01' + day_of_week, 'FMDay')) || 's: ' ||
      to_char(starts_at,'FMHH12:MI AM') || ' to ' || to_char(ends_at,'FMHH12:MI AM') ||
      case when call_type='flexible' then ' (flexible window; call no longer than ' || max_call_minutes || ' minutes)' else '' end
    else to_char(event_date,'FMMonth FMDD, YYYY') || ': ' || to_char(starts_at,'FMHH12:MI AM') || ' to ' || to_char(ends_at,'FMHH12:MI AM') end,
    E'\n' order by case when recurrence_type='weekly' then 0 else 1 end,day_of_week,event_date,starts_at
  ) into rehearsal_text from project_conflict_windows
  where project_id=target_project_id and active and schedule_category='rehearsal';

  select string_agg(label || ': ' || to_char(event_date,'FMMonth FMDD, YYYY') || ', ' || to_char(starts_at,'FMHH12:MI AM') || ' to ' || to_char(ends_at,'FMHH12:MI AM'), E'\n' order by event_date,starts_at,label)
  into tech_text from project_conflict_windows
  where project_id=target_project_id and active and schedule_category in ('designer_run','tech','dress','photo_call');

  select string_agg(label || ': ' || to_char(event_date,'FMMonth FMDD, YYYY') || ', ' || to_char(starts_at,'FMHH12:MI AM') || ' to ' || to_char(ends_at,'FMHH12:MI AM'), E'\n' order by event_date,starts_at,label)
  into performance_text from project_conflict_windows
  where project_id=target_project_id and active and schedule_category in ('performance','strike');

  select coalesce((select structured_schedule_enabled from project_role_acceptance_settings where project_id=target_project_id),false)
    or exists(select 1 from project_conflict_windows where project_id=target_project_id and schedule_category<>'rehearsal') into managed;

  insert into project_role_acceptance_settings(project_id,rehearsal_schedule,tech_schedule,performance_schedule,structured_schedule_enabled)
  values(target_project_id,coalesce(rehearsal_text,''),coalesce(tech_text,''),coalesce(performance_text,''),managed)
  on conflict(project_id) do update set
    rehearsal_schedule=case when rehearsal_text is null then project_role_acceptance_settings.rehearsal_schedule else rehearsal_text end,
    tech_schedule=case when managed then coalesce(tech_text,'') when tech_text is null then project_role_acceptance_settings.tech_schedule else tech_text end,
    performance_schedule=case when managed then coalesce(performance_text,'') when performance_text is null then project_role_acceptance_settings.performance_schedule else performance_text end,
    structured_schedule_enabled=managed;
end $$;

create or replace function app_production_management.sync_structured_schedule_text()
returns trigger language plpgsql security definer set search_path=app_production_management,pg_temp as $$
begin
  perform refresh_project_schedule_text(coalesce(new.project_id,old.project_id));
  return coalesce(new,old);
end $$;
drop trigger if exists sync_structured_schedule_text on app_production_management.project_conflict_windows;
create trigger sync_structured_schedule_text after insert or update or delete
on app_production_management.project_conflict_windows for each row execute function app_production_management.sync_structured_schedule_text();

revoke all on function app_production_management.refresh_project_schedule_text(uuid) from public,authenticated;
revoke all on function app_production_management.sync_structured_schedule_text() from public,authenticated;
grant execute on function app_production_management.refresh_project_schedule_text(uuid) to service_role;
notify pgrst,'reload schema';
commit;
