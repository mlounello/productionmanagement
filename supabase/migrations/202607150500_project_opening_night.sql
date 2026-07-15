begin;

alter table app_production_management.projects
  add column if not exists opening_on date;

comment on column app_production_management.projects.opening_on is
  'Opening-night date used to generate the project-owned standard rehearsal, tech/dress, performance, and strike schedules.';

commit;
