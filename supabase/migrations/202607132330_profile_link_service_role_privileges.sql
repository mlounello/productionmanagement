begin;

-- Server-only branded profile links and reminders use the Supabase service
-- role. Custom schemas do not automatically grant that role table privileges,
-- even though it bypasses RLS, so grant only the relations/actions required by
-- those server workflows.
grant select on app_production_management.people to service_role;
grant select on app_production_management.projects to service_role;
grant select on app_production_management.email_templates to service_role;
grant select on app_production_management.project_publicity_settings to service_role;

grant select, insert, update, delete
  on app_production_management.profile_access_links
  to service_role;

grant select, update
  on app_production_management.project_publicity_submissions
  to service_role;

grant insert
  on app_production_management.email_messages
  to service_role;

commit;
