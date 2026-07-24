begin;

-- Automatic Playbill lifecycle work runs after contributor approval and from
-- the protected cron. The service role bypasses RLS, but PostgreSQL still
-- requires explicit table privileges in this custom schema.
grant select, insert, update, delete
on app_production_management.external_links
to service_role;

grant select, update
on app_production_management.role_assignments
to service_role;

grant select
on app_production_management.project_roles,
   app_production_management.people
to service_role;

commit;
