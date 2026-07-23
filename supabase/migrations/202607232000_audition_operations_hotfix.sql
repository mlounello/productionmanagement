-- Restore the narrowly scoped service-role access required by the audition
-- Calendar bridge. This changes grants only and does not mutate audition data.

grant select on table app_production_management.audition_sessions
  to service_role;

grant select, update on table app_production_management.audition_slots
  to service_role;
