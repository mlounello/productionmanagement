begin;

create or replace function app_production_management.prepare_assignment_publicity()
returns trigger
language plpgsql
security definer
set search_path = app_production_management, public
as $$
begin
  if new.status in ('declined', 'withdrawn') then
    return new;
  end if;

  insert into app_production_management.project_publicity_submissions (
    project_id,
    person_id,
    credited_name,
    bio,
    headshot_url,
    source_profile_version,
    status,
    playbill_sync_status,
    playbill_submission_status,
    bio_required
  )
  select
    new.project_id,
    person.id,
    coalesce(
      nullif(trim(concat_ws(' ', nullif(trim(person.first_name), ''), nullif(trim(person.last_name), ''))), ''),
      nullif(trim(person.full_name), ''),
      'Production participant'
    ),
    coalesce(person.publicity_bio, ''),
    coalesce(person.publicity_headshot_url, ''),
    coalesce(person.publicity_profile_version, 1),
    'draft',
    'not_ready',
    'pending',
    true
  from app_production_management.people person
  where person.id = new.person_id
  on conflict (project_id, person_id) do nothing;

  new.onboarding_checklist :=
    coalesce(new.onboarding_checklist, '{}'::jsonb)
    || jsonb_build_object('publicity_prepared', true);

  return new;
end;
$$;

drop trigger if exists prepare_assignment_publicity on app_production_management.role_assignments;
create trigger prepare_assignment_publicity
before insert or update of status, project_id, person_id
on app_production_management.role_assignments
for each row
execute function app_production_management.prepare_assignment_publicity();

insert into app_production_management.project_publicity_submissions (
  project_id,
  person_id,
  credited_name,
  bio,
  headshot_url,
  source_profile_version,
  status,
  playbill_sync_status,
  playbill_submission_status,
  bio_required
)
select distinct
  assignment.project_id,
  person.id,
  coalesce(
    nullif(trim(concat_ws(' ', nullif(trim(person.first_name), ''), nullif(trim(person.last_name), ''))), ''),
    nullif(trim(person.full_name), ''),
    'Production participant'
  ),
  coalesce(person.publicity_bio, ''),
  coalesce(person.publicity_headshot_url, ''),
  coalesce(person.publicity_profile_version, 1),
  'draft',
  'not_ready',
  'pending',
  true
from app_production_management.role_assignments assignment
join app_production_management.people person on person.id = assignment.person_id
where assignment.status not in ('declined', 'withdrawn')
on conflict (project_id, person_id) do nothing;

update app_production_management.role_assignments assignment
set onboarding_checklist =
  coalesce(assignment.onboarding_checklist, '{}'::jsonb)
  || jsonb_build_object('publicity_prepared', true)
where assignment.status not in ('declined', 'withdrawn')
  and exists (
    select 1
    from app_production_management.project_publicity_submissions submission
    where submission.project_id = assignment.project_id
      and submission.person_id = assignment.person_id
  );

commit;
