begin;

-- Production Management invokes this private activation routine with the
-- service-role client after creating or locating the matching auth account.
grant execute on function app_production_management.activate_pending_department_budget_access(uuid, text)
to service_role;

alter table app_production_management.role_assignments
  drop constraint if exists role_assignments_confirmation_status_check;
alter table app_production_management.role_assignments
  add constraint role_assignments_confirmation_status_check
  check (confirmation_status in ('not_sent', 'sent', 'accepted', 'declined', 'bounced', 'not_required'));

create or replace function app_production_management.normalize_assignment_confirmation()
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
    new.confirmation_status := 'not_required';
    new.acceptance_required := false;
    if employee then
      new.status := 'accepted';
    end if;
    if new.onboarding_status = 'acceptance_pending' then
      new.onboarding_status := 'onboarding';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_assignment_confirmation
  on app_production_management.role_assignments;
create trigger normalize_assignment_confirmation
before insert or update of person_id, is_guest_artist, status, confirmation_status, acceptance_required, onboarding_status
on app_production_management.role_assignments
for each row execute function app_production_management.normalize_assignment_confirmation();

create or replace function app_production_management.accept_guest_artist_assignment_from_contract(
  target_assignment_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, public
as $$
declare
  accepted_count integer := 0;
begin
  update app_production_management.role_assignments assignment
  set
    status = 'accepted',
    confirmation_status = 'not_required',
    acceptance_required = false,
    onboarding_status = case
      when assignment.onboarding_status = 'acceptance_pending' then 'onboarding'
      else assignment.onboarding_status
    end
  where assignment.id = target_assignment_id
    and assignment.is_guest_artist
    and assignment.status not in ('accepted', 'declined', 'withdrawn')
    and exists (
      select 1
      from app_production_management.external_links artist_link
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
        and contract.workflow_status in ('contract_signed_returned', 'siena_signed')
      where artist_link.local_entity_type = 'role_assignment'
        and artist_link.local_entity_id = assignment.id
        and artist_link.external_app = 'theatre_budget'
        and artist_link.external_schema = 'app_theatre_budget'
        and artist_link.external_table = 'guest_artists'
        and artist_link.sync_status <> 'disabled'
    );

  get diagnostics accepted_count = row_count;
  return accepted_count > 0;
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

  if new.is_guest_artist and new.status not in ('accepted', 'declined', 'withdrawn') then
    perform app_production_management.accept_guest_artist_assignment_from_contract(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists finish_exempt_assignment_lifecycle
  on app_production_management.role_assignments;
create trigger finish_exempt_assignment_lifecycle
after insert or update of person_id, is_guest_artist, status, confirmation_status, acceptance_required, onboarding_status
on app_production_management.role_assignments
for each row execute function app_production_management.finish_exempt_assignment_lifecycle();

create or replace function app_production_management.normalize_employee_assignments()
returns trigger
language plpgsql
security definer
set search_path = app_production_management, public
as $$
begin
  if new.is_siena_employee then
    update app_production_management.role_assignments
    set
      status = 'accepted',
      confirmation_status = 'not_required',
      acceptance_required = false,
      onboarding_status = case
        when onboarding_status = 'acceptance_pending' then 'onboarding'
        else onboarding_status
      end
    where person_id = new.id
      and status not in ('declined', 'withdrawn');
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_employee_assignments
  on app_production_management.people;
create trigger normalize_employee_assignments
after insert or update of is_siena_employee
on app_production_management.people
for each row execute function app_production_management.normalize_employee_assignments();

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
    perform app_production_management.accept_guest_artist_assignment_from_contract(new.local_entity_id);
  end if;
  return new;
end;
$$;

drop trigger if exists reconcile_assignment_after_budget_link
  on app_production_management.external_links;
create trigger reconcile_assignment_after_budget_link
after insert or update of external_id, sync_status
on app_production_management.external_links
for each row execute function app_production_management.reconcile_assignment_after_budget_link();

create or replace function app_production_management.reconcile_assignments_after_contract_status()
returns trigger
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, public
as $$
declare
  assignment_record record;
begin
  if new.workflow_status not in ('contract_signed_returned', 'siena_signed') then
    return new;
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
      and artist_link.external_id = new.guest_artist_id::text
      and artist_link.sync_status <> 'disabled'
    join app_production_management.external_links project_link
      on project_link.local_entity_type = 'project'
      and project_link.local_entity_id = assignment.project_id
      and project_link.external_app = 'theatre_budget'
      and project_link.external_schema = 'app_theatre_budget'
      and project_link.external_table = 'projects'
      and project_link.external_id = coalesce(new.production_project_id, new.project_id)::text
      and project_link.sync_status <> 'disabled'
    where assignment.is_guest_artist
  loop
    perform app_production_management.accept_guest_artist_assignment_from_contract(assignment_record.id);
  end loop;

  return new;
end;
$$;

drop trigger if exists reconcile_assignments_after_contract_status
  on app_theatre_budget.contracts;
create trigger reconcile_assignments_after_contract_status
after insert or update of workflow_status, guest_artist_id, project_id, production_project_id
on app_theatre_budget.contracts
for each row execute function app_production_management.reconcile_assignments_after_contract_status();

-- Existing Guest Artists and Siena Employees no longer need a synthetic
-- confirmation. Employee assignments are inherently accepted.
update app_production_management.role_assignments assignment
set
  confirmation_status = 'not_required',
  acceptance_required = false,
  status = case when person.is_siena_employee then 'accepted' else assignment.status end,
  onboarding_status = case
    when assignment.onboarding_status = 'acceptance_pending' then 'onboarding'
    else assignment.onboarding_status
  end
from app_production_management.people person
where person.id = assignment.person_id
  and assignment.status not in ('declined', 'withdrawn')
  and (assignment.is_guest_artist or person.is_siena_employee);

update app_production_management.role_acceptance_requests request
set
  status = 'waived',
  updated_at = now()
from app_production_management.role_assignments assignment
join app_production_management.people person on person.id = assignment.person_id
where request.role_assignment_id = assignment.id
  and (assignment.is_guest_artist or person.is_siena_employee)
  and request.status not in ('accepted', 'declined', 'waived');

do $$
declare
  assignment_record record;
begin
  for assignment_record in
    select id
    from app_production_management.role_assignments
    where is_guest_artist
      and status not in ('accepted', 'declined', 'withdrawn')
  loop
    perform app_production_management.accept_guest_artist_assignment_from_contract(assignment_record.id);
  end loop;
end $$;

alter function app_production_management.normalize_assignment_confirmation()
  owner to postgres;
alter function app_production_management.finish_exempt_assignment_lifecycle()
  owner to postgres;
alter function app_production_management.normalize_employee_assignments()
  owner to postgres;
alter function app_production_management.accept_guest_artist_assignment_from_contract(uuid)
  owner to postgres;
alter function app_production_management.reconcile_assignment_after_budget_link()
  owner to postgres;
alter function app_production_management.reconcile_assignments_after_contract_status()
  owner to postgres;

revoke all on function app_production_management.normalize_assignment_confirmation()
from public, anon, authenticated;
revoke all on function app_production_management.finish_exempt_assignment_lifecycle()
from public, anon, authenticated;
revoke all on function app_production_management.normalize_employee_assignments()
from public, anon, authenticated;
revoke all on function app_production_management.accept_guest_artist_assignment_from_contract(uuid)
from public, anon, authenticated;
revoke all on function app_production_management.reconcile_assignment_after_budget_link()
from public, anon, authenticated;
revoke all on function app_production_management.reconcile_assignments_after_contract_status()
from public, anon, authenticated;

commit;
