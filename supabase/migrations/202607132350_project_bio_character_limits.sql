begin;

alter table app_production_management.project_publicity_settings
  add column if not exists bio_character_limit integer not null default 350;

alter table app_production_management.project_publicity_settings
  drop constraint if exists project_publicity_bio_character_limit_check;
alter table app_production_management.project_publicity_settings
  add constraint project_publicity_bio_character_limit_check
  check (bio_character_limit between 50 and 5000);

comment on column app_production_management.project_publicity_settings.bio_character_limit is
  'Maximum visible-text characters allowed in each show-specific bio. HTML formatting tags are not counted.';

commit;
