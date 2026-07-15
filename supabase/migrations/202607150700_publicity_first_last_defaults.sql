begin;

-- Clean only untouched draft defaults. Deliberate project credit edits,
-- approval-stage records, and locked Playbill records remain unchanged.
update app_production_management.project_publicity_submissions submission
set credited_name = coalesce(
  nullif(concat_ws(' ',nullif(trim(person.first_name),''),nullif(trim(person.last_name),'')),''),
  nullif(trim(person.full_name),''),
  submission.credited_name
)
from app_production_management.people person
where person.id = submission.person_id
  and submission.status in ('draft','changes_requested')
  and submission.playbill_submission_status <> 'locked'
  and submission.credited_name in (
    trim(person.full_name),
    case
      when nullif(trim(person.preferred_name),'') is null then trim(person.full_name)
      when nullif(trim(person.last_name),'') is null or lower(trim(person.preferred_name)) like '%' || lower(trim(person.last_name)) then trim(person.preferred_name)
      else trim(person.preferred_name) || ' ' || trim(person.last_name)
    end
  );

commit;
