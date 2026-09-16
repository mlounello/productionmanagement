begin;

alter table app_production_management.project_roles
  add column if not exists allows_multiple_assignments boolean not null default false,
  add column if not exists assignment_capacity integer;

alter table app_production_management.project_roles
  drop constraint if exists project_roles_assignment_capacity_check;

alter table app_production_management.project_roles
  add constraint project_roles_assignment_capacity_check
  check (assignment_capacity is null or assignment_capacity >= 1);

create or replace function app_production_management.role_has_assignment_capacity(target_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app_production_management, public
as $$
  select case
    when role.id is null then false
    when not role.allows_multiple_assignments then active.count < 1
    when role.assignment_capacity is null then true
    else active.count < role.assignment_capacity
  end
  from app_production_management.project_roles role
  cross join lateral (
    select count(*)::integer as count
    from app_production_management.role_assignments assignment
    where assignment.role_id = role.id
      and assignment.status not in ('declined', 'withdrawn')
  ) active
  where role.id = target_role_id;
$$;

create or replace function app_production_management.enforce_role_assignment_capacity()
returns trigger
language plpgsql
security definer
set search_path = app_production_management, public
as $$
declare
  target_role app_production_management.project_roles;
  active_count integer;
  target_capacity integer;
begin
  if new.status in ('declined', 'withdrawn') then return new; end if;

  select * into target_role
  from app_production_management.project_roles
  where id = new.role_id
  for update;

  if target_role.id is null or target_role.project_id <> new.project_id then
    raise exception 'The selected role does not belong to this project.';
  end if;

  select count(*)::integer into active_count
  from app_production_management.role_assignments assignment
  where assignment.role_id = new.role_id
    and assignment.status not in ('declined', 'withdrawn')
    and assignment.id is distinct from new.id;

  target_capacity := case
    when target_role.allows_multiple_assignments then target_role.assignment_capacity
    else 1
  end;

  if target_capacity is not null and active_count >= target_capacity then
    raise exception 'That role has reached its assignment capacity.';
  end if;
  return new;
end;
$$;

drop trigger if exists role_assignments_capacity_guard on app_production_management.role_assignments;
create trigger role_assignments_capacity_guard
before insert or update of role_id, project_id, status
on app_production_management.role_assignments
for each row execute function app_production_management.enforce_role_assignment_capacity();

create or replace function app_production_management.enforce_project_role_capacity_change()
returns trigger
language plpgsql
security definer
set search_path = app_production_management, public
as $$
declare
  active_count integer;
  target_capacity integer;
begin
  if not new.allows_multiple_assignments then new.assignment_capacity := null; end if;
  select count(*)::integer into active_count
  from app_production_management.role_assignments assignment
  where assignment.role_id = new.id
    and assignment.status not in ('declined', 'withdrawn');
  target_capacity := case when new.allows_multiple_assignments then new.assignment_capacity else 1 end;
  if target_capacity is not null and active_count > target_capacity then
    raise exception 'This role already has % active assignments; remove assignments or raise the capacity first.', active_count;
  end if;
  return new;
end;
$$;

drop trigger if exists project_roles_capacity_change_guard on app_production_management.project_roles;
create trigger project_roles_capacity_change_guard
before update of allows_multiple_assignments, assignment_capacity
on app_production_management.project_roles
for each row execute function app_production_management.enforce_project_role_capacity_change();

create or replace function app_production_management.get_public_audition_form(form_token uuid)
returns jsonb language sql stable security definer set search_path=app_production_management,public as $$
select jsonb_build_object('form',to_jsonb(f),'project',jsonb_build_object('id',p.id,'title',p.title),
'schedule',coalesce((select jsonb_build_object('rehearsals',settings.rehearsal_schedule,'tech_and_dress',settings.tech_schedule,'performances_and_strike',settings.performance_schedule) from project_role_acceptance_settings settings where settings.project_id=f.project_id),'{}'::jsonb),
'sections',coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from audition_form_sections s where s.form_id=f.id),'[]'::jsonb),
'fields',coalesce((select jsonb_agg(to_jsonb(ff) order by ff.sort_order) from audition_form_fields ff where ff.form_id=f.id),'[]'::jsonb),
'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'role_group',r.role_group) order by r.role_group,r.name) from project_roles r where r.project_id=f.project_id and app_production_management.role_has_assignment_capacity(r.id)),'[]'::jsonb),
'sessions',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from audition_sessions x where x.project_id=f.project_id and x.is_published and (x.booking_opens_at is null or x.booking_opens_at<=now()) and (x.booking_closes_at is null or x.booking_closes_at>now())),'[]'::jsonb),
'slots',coalesce((select jsonb_agg(to_jsonb(sl)||jsonb_build_object('booked',(select count(*) from audition_submission_slots b join audition_submissions sub on sub.id=b.submission_id where b.slot_id=sl.id and sub.cancelled_at is null)) order by sl.starts_at) from audition_slots sl join audition_sessions sx on sx.id=sl.session_id where sx.project_id=f.project_id and sx.is_published and sl.status='open' and (sx.booking_opens_at is null or sx.booking_opens_at<=now()) and (sx.booking_closes_at is null or sx.booking_closes_at>now())),'[]'::jsonb))
from audition_forms f join projects p on p.id=f.project_id where f.public_token=form_token and f.status='published' and (f.closes_at is null or f.closes_at>now());$$;

create or replace function app_production_management.get_audition_form_preview(form_token uuid)
returns jsonb language sql stable security definer set search_path=app_production_management,public as $$
select jsonb_build_object('form',to_jsonb(f),'project',jsonb_build_object('id',p.id,'title',p.title),
'schedule',coalesce((select jsonb_build_object('rehearsals',settings.rehearsal_schedule,'tech_and_dress',settings.tech_schedule,'performances_and_strike',settings.performance_schedule) from project_role_acceptance_settings settings where settings.project_id=f.project_id),'{}'::jsonb),
'sections',coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from audition_form_sections s where s.form_id=f.id),'[]'::jsonb),
'fields',coalesce((select jsonb_agg(to_jsonb(ff) order by ff.sort_order) from audition_form_fields ff where ff.form_id=f.id),'[]'::jsonb),
'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'role_group',r.role_group) order by r.role_group,r.name) from project_roles r where r.project_id=f.project_id and app_production_management.role_has_assignment_capacity(r.id)),'[]'::jsonb),
'sessions',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from audition_sessions x where x.project_id=f.project_id and x.is_published),'[]'::jsonb),
'slots',coalesce((select jsonb_agg(to_jsonb(sl)||jsonb_build_object('booked',(select count(*) from audition_submission_slots b join audition_submissions sub on sub.id=b.submission_id where b.slot_id=sl.id and sub.cancelled_at is null)) order by sl.starts_at) from audition_slots sl join audition_sessions sx on sx.id=sl.session_id where sx.project_id=f.project_id and sx.is_published and sl.status='open'),'[]'::jsonb))
from audition_forms f join projects p on p.id=f.project_id where f.public_token=form_token and auth.uid() is not null and app_production_management.can_review_auditions(f.project_id);$$;

revoke all on function app_production_management.role_has_assignment_capacity(uuid) from public;
grant execute on function app_production_management.role_has_assignment_capacity(uuid) to anon, authenticated, service_role;
grant execute on function app_production_management.get_public_audition_form(uuid) to anon,authenticated;
revoke all on function app_production_management.get_audition_form_preview(uuid) from public,anon;
grant execute on function app_production_management.get_audition_form_preview(uuid) to authenticated,service_role;

commit;
