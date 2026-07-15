begin;

alter table app_production_management.project_publicity_submissions
  add column if not exists bio_required boolean not null default true;

comment on column app_production_management.project_publicity_submissions.bio_required is
  'When false, this person is excluded from project publicity outstanding counts and reminders.';

commit;
