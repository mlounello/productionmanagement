begin;

-- Released casting offers are permanent history. Removing the active role
-- assignment must therefore detach, rather than delete, its signed acceptance
-- request; casting_offers continues to reference the preserved request.
alter table app_production_management.role_acceptance_requests
  drop constraint if exists role_acceptance_requests_role_assignment_id_fkey;

alter table app_production_management.role_acceptance_requests
  alter column role_assignment_id drop not null;

alter table app_production_management.role_acceptance_requests
  add constraint role_acceptance_requests_role_assignment_id_fkey
  foreign key (role_assignment_id)
  references app_production_management.role_assignments(id)
  on delete set null;

notify pgrst, 'reload schema';

commit;
