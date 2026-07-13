begin;

-- Repair installations where the privilege bridge function was created by a
-- role that can create functions but cannot read/update Playbill's tables.
alter function app_production_management.push_publicity_to_playbill(uuid) owner to postgres;

grant usage on schema app_production_management, app_playbill to postgres;
grant select on app_production_management.project_publicity_submissions,
  app_production_management.external_links,
  app_production_management.role_assignments to postgres;
grant update on app_production_management.project_publicity_submissions to postgres;
grant insert on app_production_management.audit_log to postgres;
grant select, update on app_playbill.people, app_playbill.submission_requests to postgres;

revoke all on function app_production_management.push_publicity_to_playbill(uuid) from public, anon, authenticated;
grant execute on function app_production_management.push_publicity_to_playbill(uuid) to service_role;

commit;
