begin;

-- Casting release prepares the student's project publicity row through the
-- server-only admin client. Custom schemas require an explicit table grant;
-- the earlier profile-link grant intentionally omitted inserts.
grant select, insert, update
  on app_production_management.project_publicity_submissions
  to service_role;

commit;
