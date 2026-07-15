begin;

-- Public submissions are created by security-definer RPCs, while the server
-- action uses the service role for form verification, duplicate resolution,
-- reusable-profile enrichment, and post-submit reconciliation.
grant select on table
  app_production_management.audition_forms,
  app_production_management.project_roles
to service_role;

grant select,update on table
  app_production_management.audition_submissions
to service_role;

commit;
