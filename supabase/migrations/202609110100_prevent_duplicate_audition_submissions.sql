begin;

-- A public form may be submitted from multiple tabs or retried after a slow
-- response. Serialize submissions for the same form/email before checking so
-- concurrent requests cannot create two active records.
create or replace function app_production_management.prevent_duplicate_active_audition_submission()
returns trigger
language plpgsql
set search_path = app_production_management, public
as $$
begin
  new.applicant_email := lower(trim(coalesce(new.applicant_email, '')));

  if new.applicant_email = '' then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.form_id::text || ':' || new.applicant_email, 0)
  );

  if exists (
    select 1
    from app_production_management.audition_submissions existing
    where existing.form_id = new.form_id
      and lower(trim(existing.applicant_email)) = new.applicant_email
      and existing.cancelled_at is null
  ) then
    raise exception using
      errcode = '23505',
      message = 'An active audition submission already exists for this form and email address.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_active_audition_submission
  on app_production_management.audition_submissions;

create trigger prevent_duplicate_active_audition_submission
before insert on app_production_management.audition_submissions
for each row
execute function app_production_management.prevent_duplicate_active_audition_submission();

commit;
