begin;

-- Preserve the original agreement while recording whether it is still active.
alter table app_theatre_budget.contracts
  add column if not exists engagement_status text not null default 'active',
  add column if not exists terminated_on date,
  add column if not exists termination_reason text not null default '',
  add column if not exists released_amount numeric(12, 2) not null default 0,
  add column if not exists terminated_by_user_id uuid references auth.users(id) on delete set null;

alter table app_theatre_budget.contracts
  drop constraint if exists contracts_engagement_status_check;
alter table app_theatre_budget.contracts
  add constraint contracts_engagement_status_check
  check (engagement_status in ('active', 'completed', 'terminated'));

alter table app_theatre_budget.contract_installments
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text not null default '',
  add column if not exists cancelled_by_user_id uuid references auth.users(id) on delete set null;

alter table app_theatre_budget.contract_installments
  drop constraint if exists contract_installments_status_check;
alter table app_theatre_budget.contract_installments
  add constraint contract_installments_status_check
  check (status in ('planned', 'check_request_submitted', 'check_paid', 'cancelled'));

create table if not exists app_production_management.guest_artist_offboardings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects(id) on delete cascade,
  role_assignment_id uuid not null references app_production_management.role_assignments(id) on delete restrict,
  person_id uuid not null references app_production_management.people(id) on delete restrict,
  budget_contract_id uuid not null,
  effective_on date not null,
  private_notes text not null,
  original_contract_value numeric(12, 2) not null default 0,
  paid_amount numeric(12, 2) not null default 0,
  released_amount numeric(12, 2) not null default 0,
  mark_person_inactive boolean not null default false,
  status text not null default 'completed',
  integration_results jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role_assignment_id),
  check (status in ('completed', 'needs_attention'))
);

create index if not exists idx_guest_artist_offboardings_project
  on app_production_management.guest_artist_offboardings(project_id, effective_on desc);

alter table app_production_management.guest_artist_offboardings enable row level security;
drop policy if exists "guest artist offboardings owner only" on app_production_management.guest_artist_offboardings;
create policy "guest artist offboardings owner only"
on app_production_management.guest_artist_offboardings
for all to authenticated
using (app_production_management.get_user_role() = 'owner')
with check (app_production_management.get_user_role() = 'owner');

grant select on app_production_management.guest_artist_offboardings to authenticated;

-- Once terminated, financial history is immutable through ordinary Budget UI
-- edits. Corrections require a separate audited administrative migration.
create or replace function app_production_management.protect_terminated_guest_artist_contract()
returns trigger
language plpgsql
security definer
set search_path = app_theatre_budget, public
as $$
begin
  if old.engagement_status = 'terminated' then
    raise exception 'This guest artist engagement is terminated and its financial history is locked.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists protect_terminated_guest_artist_contract
  on app_theatre_budget.contracts;
create trigger protect_terminated_guest_artist_contract
before update or delete on app_theatre_budget.contracts
for each row execute function app_production_management.protect_terminated_guest_artist_contract();

create or replace function app_production_management.protect_terminated_guest_artist_installments()
returns trigger
language plpgsql
security definer
set search_path = app_theatre_budget, public
as $$
declare
  related_contract_id uuid;
begin
  related_contract_id := case when tg_op = 'DELETE' then old.contract_id else new.contract_id end;
  if exists (
    select 1 from app_theatre_budget.contracts
    where id = related_contract_id
      and engagement_status = 'terminated'
  ) then
    raise exception 'This installment belongs to a terminated guest artist engagement and is locked.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists protect_terminated_guest_artist_installments
  on app_theatre_budget.contract_installments;
create trigger protect_terminated_guest_artist_installments
before insert or update or delete on app_theatre_budget.contract_installments
for each row execute function app_production_management.protect_terminated_guest_artist_installments();

-- A terminated contract must never reactivate its Production Management assignment.
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
  contract_engagement_status text;
  desired_status text := 'offered';
begin
  select contract.workflow_status, contract.engagement_status
  into contract_status, contract_engagement_status
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

  if contract_engagement_status = 'terminated' then
    desired_status := 'withdrawn';
  elsif contract_status in ('contract_signed_returned', 'siena_signed') then
    desired_status := 'accepted';
  end if;

  update app_production_management.role_assignments assignment
  set
    status = desired_status,
    confirmation_status = 'not_required',
    acceptance_required = false,
    onboarding_status = case
      when desired_status = 'withdrawn' then 'skipped'
      when assignment.onboarding_status = 'acceptance_pending' then 'onboarding'
      else assignment.onboarding_status
    end
  where assignment.id = target_assignment_id
    and assignment.is_guest_artist
    and (
      contract_engagement_status = 'terminated'
      or assignment.status not in ('declined', 'withdrawn')
    )
    and (
      assignment.status is distinct from desired_status
      or assignment.confirmation_status is distinct from 'not_required'
      or assignment.acceptance_required
      or (desired_status = 'withdrawn' and assignment.onboarding_status <> 'skipped')
    );

  return desired_status;
end;
$$;

drop trigger if exists reconcile_assignments_after_contract_status
  on app_theatre_budget.contracts;
create trigger reconcile_assignments_after_contract_status
after insert or delete or update of workflow_status, engagement_status, guest_artist_id, project_id, production_project_id
on app_theatre_budget.contracts
for each row execute function app_production_management.reconcile_assignments_after_contract_status();

create or replace function app_production_management.offboard_guest_artist_assignment(
  target_project_id uuid,
  target_assignment_id uuid,
  target_contract_id uuid,
  effective_on date,
  private_notes text,
  mark_person_inactive boolean,
  actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = app_production_management, app_theatre_budget, core, auth, public
as $$
declare
  assignment_record record;
  contract_record record;
  installment_record record;
  purchase_record record;
  paid_total numeric(12, 2) := 0;
  released_total numeric(12, 2) := 0;
  offboarding_id uuid;
  other_active_assignments integer := 0;
  note_entry text;
begin
  if not exists (
    select 1
    from core.app_memberships membership
    where membership.user_id = actor_user_id
      and membership.app_id = 'production_management'
      and lower(membership.role) = 'owner'
      and membership.is_active = true
  ) then
    raise exception 'Only the Production Management owner can end a guest artist engagement.';
  end if;

  if effective_on is null then
    raise exception 'An effective date is required.';
  end if;
  if nullif(btrim(coalesce(private_notes, '')), '') is null then
    raise exception 'Private termination notes are required.';
  end if;

  select assignment.*, person.full_name, role.name as role_name
  into assignment_record
  from app_production_management.role_assignments assignment
  join app_production_management.people person on person.id = assignment.person_id
  join app_production_management.project_roles role on role.id = assignment.role_id
  where assignment.id = target_assignment_id
    and assignment.project_id = target_project_id
  for update of assignment;

  if assignment_record.id is null then
    raise exception 'Role assignment not found.';
  end if;
  if not assignment_record.is_guest_artist then
    raise exception 'Only guest artist assignments can use this workflow.';
  end if;

  if exists (
    select 1
    from app_production_management.guest_artist_offboardings
    where role_assignment_id = target_assignment_id
  ) then
    raise exception 'This guest artist engagement has already been ended. Review the saved offboarding record instead of submitting it again.';
  end if;

  select contract.*
  into contract_record
  from app_theatre_budget.contracts contract
  join app_production_management.external_links artist_link
    on artist_link.local_entity_type = 'role_assignment'
    and artist_link.local_entity_id = target_assignment_id
    and artist_link.external_app = 'theatre_budget'
    and artist_link.external_schema = 'app_theatre_budget'
    and artist_link.external_table = 'guest_artists'
    and artist_link.external_id = contract.guest_artist_id::text
  join app_production_management.external_links project_link
    on project_link.local_entity_type = 'project'
    and project_link.local_entity_id = target_project_id
    and project_link.external_app = 'theatre_budget'
    and project_link.external_schema = 'app_theatre_budget'
    and project_link.external_table = 'projects'
    and project_link.external_id = coalesce(contract.production_project_id, contract.project_id)::text
  where contract.id = target_contract_id
  for update of contract;

  if contract_record.id is null then
    raise exception 'The selected Theatre Budget contract is not linked to this assignment and production.';
  end if;

  if exists (
    select 1 from app_theatre_budget.contract_installments
    where contract_id = target_contract_id
      and status = 'check_request_submitted'
  ) then
    raise exception 'A payment request is already submitted. Cancel or resolve that request in Theatre Budget before ending the engagement.';
  end if;

  select coalesce(sum(installment_amount), 0)
  into paid_total
  from app_theatre_budget.contract_installments
  where contract_id = target_contract_id
    and status = 'check_paid';

  select coalesce(sum(installment_amount), 0)
  into released_total
  from app_theatre_budget.contract_installments
  where contract_id = target_contract_id
    and status = 'planned';

  -- Cancel only unpaid planned installments. Paid history is never rewritten.
  for installment_record in
    select *
    from app_theatre_budget.contract_installments
    where contract_id = target_contract_id
      and status = 'planned'
    for update
  loop
    if installment_record.purchase_id is not null then
      select * into purchase_record
      from app_theatre_budget.purchases
      where id = installment_record.purchase_id
      for update;

      update app_theatre_budget.purchases
      set status = 'cancelled',
          procurement_status = 'cancelled',
          requested_amount = 0,
          encumbered_amount = 0,
          pending_cc_amount = 0,
          posted_amount = 0,
          notes = concat_ws(E'\n', nullif(notes, ''), 'Cancelled by Production Management guest artist offboarding on ' || effective_on::text || '.'),
          updated_at = now()
      where id = installment_record.purchase_id;

      update app_theatre_budget.institutional_budget_commitments
      set commitment_status = 'cancelled', updated_at = now()
      where purchase_id = installment_record.purchase_id
        and commitment_status <> 'cancelled';

      if purchase_record.id is not null and exists (
        select 1 from app_theatre_budget.users where id = actor_user_id
      ) then
        insert into app_theatre_budget.purchase_events (
          purchase_id, from_status, to_status,
          estimated_amount_snapshot, requested_amount_snapshot, encumbered_amount_snapshot,
          pending_cc_amount_snapshot, posted_amount_snapshot,
          changed_by_user_id, note
        ) values (
          purchase_record.id, purchase_record.status, 'cancelled',
          purchase_record.estimated_amount, 0, 0, 0, 0,
          actor_user_id, 'Unpaid guest artist installment released through owner-confirmed Production Management offboarding.'
        );
      end if;
    end if;

    update app_theatre_budget.contract_installments
    set status = 'cancelled',
        cancelled_at = now(),
        cancellation_reason = left(btrim(private_notes), 2000),
        cancelled_by_user_id = actor_user_id,
        updated_at = now()
    where id = installment_record.id;
  end loop;

  update app_theatre_budget.contracts
  set engagement_status = 'terminated',
      terminated_on = effective_on,
      termination_reason = left(btrim(private_notes), 4000),
      released_amount = released_total,
      terminated_by_user_id = actor_user_id,
      notes = concat_ws(E'\n', nullif(notes, ''), 'Engagement ended ' || effective_on::text || '. Original contract value retained; unpaid planned balance released.'),
      updated_at = now()
  where id = target_contract_id;

  update app_production_management.role_assignments
  set status = 'withdrawn',
      confirmation_status = 'not_required',
      acceptance_required = false,
      onboarding_status = 'skipped',
      google_automation_skipped = true,
      google_automation_skip_reason = 'Guest artist engagement ended ' || effective_on::text || '.',
      google_group_sync_status = 'skipped',
      google_group_sync_error = '',
      welcome_email_status = 'skipped',
      welcome_email_error = '',
      playbill_sync_status = 'disabled',
      guest_artist_sync_status = 'disabled',
      sync_notes = 'Guest artist engagement ended ' || effective_on::text || '.',
      updated_at = now()
  where id = target_assignment_id;

  perform app_production_management.clear_assignment_department_budget_access(target_assignment_id);

  update app_production_management.project_publicity_submissions
  set bio_required = false,
      status = 'draft',
      playbill_sync_status = 'disabled',
      playbill_sync_error = '',
      last_reminder_sent_at = null,
      updated_at = now()
  where project_id = target_project_id
    and person_id = assignment_record.person_id
    and playbill_submission_status <> 'locked';

  note_entry := format(
    '[%s] Guest artist engagement ended for %s — %s. Original contract: $%s; paid: $%s; released: $%s. %s',
    effective_on::text,
    assignment_record.role_name,
    assignment_record.full_name,
    to_char(contract_record.contract_value, 'FM999999990.00'),
    to_char(paid_total, 'FM999999990.00'),
    to_char(released_total, 'FM999999990.00'),
    btrim(private_notes)
  );

  insert into app_production_management.person_management_details(person_id, notes, updated_at)
  values (assignment_record.person_id, note_entry, now())
  on conflict (person_id) do update
  set notes = concat_ws(E'\n\n', nullif(app_production_management.person_management_details.notes, ''), excluded.notes),
      updated_at = now();

  select count(*) into other_active_assignments
  from app_production_management.role_assignments
  where person_id = assignment_record.person_id
    and id <> target_assignment_id
    and status not in ('declined', 'withdrawn');

  if mark_person_inactive and other_active_assignments = 0 then
    update app_production_management.people
    set status = 'inactive', updated_at = now()
    where id = assignment_record.person_id;
  end if;

  insert into app_production_management.guest_artist_offboardings (
    project_id, role_assignment_id, person_id, budget_contract_id,
    effective_on, private_notes, original_contract_value,
    paid_amount, released_amount, mark_person_inactive,
    status, integration_results, created_by
  ) values (
    target_project_id, target_assignment_id, assignment_record.person_id, target_contract_id,
    effective_on, btrim(private_notes), contract_record.contract_value,
    paid_total, released_total, mark_person_inactive,
    'completed', '{}'::jsonb, actor_user_id
  )
  returning id into offboarding_id;

  insert into app_production_management.audit_log (
    entity_type, entity_id, action, before_value, after_value, changed_by, reason
  ) values (
    'role_assignment', target_assignment_id, 'guest_artist_engagement_ended',
    jsonb_build_object(
      'assignment_status', assignment_record.status,
      'contract_value', contract_record.contract_value,
      'contract_engagement_status', contract_record.engagement_status
    ),
    jsonb_build_object(
      'assignment_status', 'withdrawn',
      'contract_engagement_status', 'terminated',
      'effective_on', effective_on,
      'paid_amount', paid_total,
      'released_amount', released_total,
      'offboarding_id', offboarding_id
    ),
    actor_user_id,
    'Owner-confirmed guest artist offboarding. Private notes are stored in the restricted management record.'
  );

  return jsonb_build_object(
    'offboarding_id', offboarding_id,
    'person_id', assignment_record.person_id,
    'person_name', assignment_record.full_name,
    'role_name', assignment_record.role_name,
    'original_contract_value', contract_record.contract_value,
    'paid_amount', paid_total,
    'released_amount', released_total,
    'person_marked_inactive', mark_person_inactive and other_active_assignments = 0
  );
end;
$$;

alter function app_production_management.sync_guest_artist_assignment_from_contract(uuid) owner to postgres;
alter function app_production_management.protect_terminated_guest_artist_contract() owner to postgres;
alter function app_production_management.protect_terminated_guest_artist_installments() owner to postgres;
alter function app_production_management.offboard_guest_artist_assignment(uuid, uuid, uuid, date, text, boolean, uuid) owner to postgres;

revoke all on function app_production_management.offboard_guest_artist_assignment(uuid, uuid, uuid, date, text, boolean, uuid)
from public, anon, authenticated;
grant execute on function app_production_management.offboard_guest_artist_assignment(uuid, uuid, uuid, date, text, boolean, uuid)
to service_role;

commit;
