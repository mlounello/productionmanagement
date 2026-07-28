begin;

insert into app_production_management.reference_values
  (reference_type, label, slug, sort_order, is_active)
values
  ('role_group', 'Stage Management', 'stage_management', 25, true)
on conflict (reference_type, slug) do update
set label = excluded.label,
    sort_order = excluded.sort_order,
    is_active = true,
    updated_at = now();

alter table app_production_management.project_setup_preferences
  alter column selected_role_groups
  set default array[
    'cast',
    'creative_team',
    'directorial_team',
    'production_team',
    'stage_management',
    'administrative',
    'front_of_house',
    'music_band'
  ]::text[];

update app_production_management.project_setup_preferences
set selected_role_groups = array_append(selected_role_groups, 'stage_management'),
    updated_at = now()
where uses_google_groups
  and not (selected_role_groups @> array['stage_management']::text[]);

create or replace function app_theatre_budget.production_management_contract_statuses(
  target_project_id uuid
)
returns table (
  id uuid,
  project_id uuid,
  guest_artist_id uuid,
  workflow_status text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = app_theatre_budget, public
as $$
  select distinct on (contract.guest_artist_id)
    contract.id,
    contract.project_id,
    contract.guest_artist_id,
    contract.workflow_status,
    contract.updated_at
  from app_theatre_budget.contracts contract
  where contract.project_id = target_project_id
    and contract.guest_artist_id is not null
  order by contract.guest_artist_id, contract.updated_at desc, contract.created_at desc;
$$;

alter function app_theatre_budget.production_management_contract_statuses(uuid) owner to postgres;
grant usage on schema app_theatre_budget to service_role, postgres;
revoke all on function app_theatre_budget.production_management_contract_statuses(uuid)
  from public, anon, authenticated;
grant execute on function app_theatre_budget.production_management_contract_statuses(uuid)
  to service_role, postgres;

commit;
