begin;

create or replace function app_production_management.sync_guest_artist_assignment_from_contract(
  target_assignment_id uuid
)
returns text
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, public
as $$
declare
  contract_status text;
  desired_status text := 'offered';
begin
  select contract.workflow_status
  into contract_status
  from app_production_management.role_assignments assignment
  join app_production_management.external_links artist_link
    on artist_link.local_entity_type = 'role_assignment'
    and artist_link.local_entity_id = assignment.id
    and artist_link.external_app = 'theatre_budget'
    and artist_link.external_schema = 'app_theatre_budget'
    and artist_link.external_table = 'guest_artists'
    and artist_link.sync_status <> 'disabled'
  join app_production_management.external_links project_link
    on project_link.local_entity_type = 'project'
    and project_link.local_entity_id = assignment.project_id
    and project_link.external_app = 'theatre_budget'
    and project_link.external_schema = 'app_theatre_budget'
    and project_link.external_table = 'projects'
    and project_link.sync_status <> 'disabled'
  join app_theatre_budget.contracts contract
    on contract.guest_artist_id::text = artist_link.external_id
    and coalesce(contract.production_project_id, contract.project_id)::text = project_link.external_id
  where assignment.id = target_assignment_id
    and assignment.is_guest_artist
  order by contract.updated_at desc, contract.created_at desc, contract.id
  limit 1;

  if contract_status in ('contract_signed_returned', 'siena_signed') then
    desired_status := 'accepted';
  end if;

  update app_production_management.role_assignments assignment
  set
    status = desired_status,
    confirmation_status = 'not_required',
    acceptance_required = false,
    onboarding_status = case
      when assignment.onboarding_status = 'acceptance_pending' then 'onboarding'
      else assignment.onboarding_status
    end
  where assignment.id = target_assignment_id
    and assignment.is_guest_artist
    and assignment.status not in ('declined', 'withdrawn')
    and (
      assignment.status is distinct from desired_status
      or assignment.confirmation_status is distinct from 'not_required'
      or assignment.acceptance_required
    );

  return desired_status;
end;
$$;

create or replace function app_production_management.finish_exempt_assignment_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = app_production_management, public
as $$
declare
  employee boolean := false;
begin
  select coalesce(person.is_siena_employee, false)
  into employee
  from app_production_management.people person
  where person.id = new.person_id;

  if new.is_guest_artist or employee then
    update app_production_management.role_acceptance_requests request
    set
      status = 'waived',
      updated_at = now()
    where request.role_assignment_id = new.id
      and request.status not in ('accepted', 'declined', 'waived');
  end if;

  if new.is_guest_artist then
    perform app_production_management.sync_guest_artist_assignment_from_contract(new.id);
  end if;

  return new;
end;
$$;

create or replace function app_production_management.reconcile_assignment_after_budget_link()
returns trigger
language plpgsql
security definer
set search_path = app_production_management, public
as $$
begin
  if new.local_entity_type = 'role_assignment'
    and new.external_app = 'theatre_budget'
    and new.external_schema = 'app_theatre_budget'
    and new.external_table = 'guest_artists'
    and new.sync_status <> 'disabled' then
    perform app_production_management.sync_guest_artist_assignment_from_contract(new.local_entity_id);
  end if;
  return new;
end;
$$;

create or replace function app_production_management.reconcile_assignments_after_contract_status()
returns trigger
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, public
as $$
declare
  source_contract record;
  assignment_record record;
begin
  if tg_op = 'DELETE' then
    source_contract := old;
  else
    source_contract := new;
  end if;

  for assignment_record in
    select distinct assignment.id
    from app_production_management.role_assignments assignment
    join app_production_management.external_links artist_link
      on artist_link.local_entity_type = 'role_assignment'
      and artist_link.local_entity_id = assignment.id
      and artist_link.external_app = 'theatre_budget'
      and artist_link.external_schema = 'app_theatre_budget'
      and artist_link.external_table = 'guest_artists'
      and artist_link.external_id = source_contract.guest_artist_id::text
      and artist_link.sync_status <> 'disabled'
    join app_production_management.external_links project_link
      on project_link.local_entity_type = 'project'
      and project_link.local_entity_id = assignment.project_id
      and project_link.external_app = 'theatre_budget'
      and project_link.external_schema = 'app_theatre_budget'
      and project_link.external_table = 'projects'
      and project_link.external_id = coalesce(source_contract.production_project_id, source_contract.project_id)::text
      and project_link.sync_status <> 'disabled'
    where assignment.is_guest_artist
  loop
    perform app_production_management.sync_guest_artist_assignment_from_contract(assignment_record.id);
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists reconcile_assignments_after_contract_status
  on app_theatre_budget.contracts;
create trigger reconcile_assignments_after_contract_status
after insert or delete or update of workflow_status, guest_artist_id, project_id, production_project_id
on app_theatre_budget.contracts
for each row execute function app_production_management.reconcile_assignments_after_contract_status();

do $$
declare
  assignment_record record;
begin
  for assignment_record in
    select id
    from app_production_management.role_assignments
    where is_guest_artist
      and status not in ('declined', 'withdrawn')
  loop
    perform app_production_management.sync_guest_artist_assignment_from_contract(assignment_record.id);
  end loop;
end $$;

alter function app_production_management.sync_guest_artist_assignment_from_contract(uuid)
  owner to postgres;
alter function app_production_management.finish_exempt_assignment_lifecycle()
  owner to postgres;
alter function app_production_management.reconcile_assignment_after_budget_link()
  owner to postgres;
alter function app_production_management.reconcile_assignments_after_contract_status()
  owner to postgres;

revoke all on function app_production_management.sync_guest_artist_assignment_from_contract(uuid)
from public, anon, authenticated;

drop function if exists app_production_management.accept_guest_artist_assignment_from_contract(uuid);

commit;
