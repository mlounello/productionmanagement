begin;

update app_production_management.audition_form_fields
set help_text='Select any currently vacant project roles you would like us to consider. Roles are grouped by team and maintained under Roles & Assignments.'
where field_type='role_selector'
  and help_text='Select any roles you would like us to consider.';

create or replace function app_production_management.get_public_audition_form(form_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = app_production_management, public
as $$
  select jsonb_build_object(
    'form',to_jsonb(f),
    'project',jsonb_build_object('id',p.id,'title',p.title),
    'sections',coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from audition_form_sections s where s.form_id=f.id),'[]'::jsonb),
    'fields',coalesce((select jsonb_agg(to_jsonb(ff) order by ff.sort_order) from audition_form_fields ff where ff.form_id=f.id),'[]'::jsonb),
    'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'role_group',r.role_group) order by r.role_group,r.name) from project_roles r where r.project_id=f.project_id and not exists (select 1 from role_assignments assignment where assignment.role_id=r.id and assignment.status not in ('declined','withdrawn'))),'[]'::jsonb),
    'sessions',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from audition_sessions x where x.project_id=f.project_id and x.is_published and (x.booking_opens_at is null or x.booking_opens_at<=now()) and (x.booking_closes_at is null or x.booking_closes_at>now())),'[]'::jsonb),
    'slots',coalesce((select jsonb_agg(to_jsonb(sl)||jsonb_build_object('booked',(select count(*) from audition_submissions sub where sub.slot_id=sl.id and sub.cancelled_at is null)) order by sl.starts_at) from audition_slots sl join audition_sessions sx on sx.id=sl.session_id where sx.project_id=f.project_id and sx.is_published and sl.status='open' and (sx.booking_opens_at is null or sx.booking_opens_at<=now()) and (sx.booking_closes_at is null or sx.booking_closes_at>now())),'[]'::jsonb)
  )
  from audition_forms f join projects p on p.id=f.project_id
  where f.public_token=form_token and f.status='published' and (f.closes_at is null or f.closes_at>now());
$$;

create or replace function app_production_management.get_audition_form_preview(form_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = app_production_management, public
as $$
  select jsonb_build_object(
    'form',to_jsonb(f),
    'project',jsonb_build_object('id',p.id,'title',p.title),
    'sections',coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from audition_form_sections s where s.form_id=f.id),'[]'::jsonb),
    'fields',coalesce((select jsonb_agg(to_jsonb(ff) order by ff.sort_order) from audition_form_fields ff where ff.form_id=f.id),'[]'::jsonb),
    'roles',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'role_group',r.role_group) order by r.role_group,r.name) from project_roles r where r.project_id=f.project_id and not exists (select 1 from role_assignments assignment where assignment.role_id=r.id and assignment.status not in ('declined','withdrawn'))),'[]'::jsonb),
    'sessions',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from audition_sessions x where x.project_id=f.project_id and x.is_published),'[]'::jsonb),
    'slots',coalesce((select jsonb_agg(to_jsonb(sl)||jsonb_build_object('booked',(select count(*) from audition_submissions sub where sub.slot_id=sl.id and sub.cancelled_at is null)) order by sl.starts_at) from audition_slots sl join audition_sessions sx on sx.id=sl.session_id where sx.project_id=f.project_id and sx.is_published and sl.status='open'),'[]'::jsonb)
  )
  from audition_forms f join projects p on p.id=f.project_id
  where f.public_token=form_token and auth.uid() is not null and app_production_management.can_review_auditions(f.project_id);
$$;

revoke all on function app_production_management.get_audition_form_preview(uuid) from public,anon;
grant execute on function app_production_management.get_audition_form_preview(uuid) to authenticated,service_role;
grant execute on function app_production_management.get_public_audition_form(uuid) to anon,authenticated;

commit;
