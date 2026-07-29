begin;

alter table app_production_management.audition_forms
  add column if not exists staff_preview_token uuid default gen_random_uuid();

update app_production_management.audition_forms
set staff_preview_token = gen_random_uuid()
where staff_preview_token is null;

alter table app_production_management.audition_forms
  alter column staff_preview_token set default gen_random_uuid(),
  alter column staff_preview_token set not null;

create unique index if not exists audition_forms_staff_preview_token_key
  on app_production_management.audition_forms (staff_preview_token);

create or replace function app_production_management.get_shared_audition_form_preview(preview_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = app_production_management, public
as $$
select jsonb_build_object(
  'form', to_jsonb(form_row),
  'project', jsonb_build_object('id', project.id, 'title', project.title),
  'schedule', coalesce((
    select jsonb_build_object(
      'rehearsals', settings.rehearsal_schedule,
      'tech_and_dress', settings.tech_schedule,
      'performances_and_strike', settings.performance_schedule
    )
    from project_role_acceptance_settings settings
    where settings.project_id = form_row.project_id
  ), '{}'::jsonb),
  'sections', coalesce((
    select jsonb_agg(to_jsonb(section) order by section.sort_order)
    from audition_form_sections section
    where section.form_id = form_row.id
  ), '[]'::jsonb),
  'fields', coalesce((
    select jsonb_agg(to_jsonb(field) order by field.sort_order)
    from audition_form_fields field
    where field.form_id = form_row.id
  ), '[]'::jsonb),
  'roles', coalesce((
    select jsonb_agg(
      jsonb_build_object('id', role.id, 'name', role.name, 'role_group', role.role_group)
      order by role.role_group, role.name
    )
    from project_roles role
    where role.project_id = form_row.project_id
      and not exists (
        select 1
        from role_assignments assignment
        where assignment.role_id = role.id
          and assignment.status not in ('declined', 'withdrawn')
      )
  ), '[]'::jsonb),
  'sessions', coalesce((
    select jsonb_agg(to_jsonb(session) order by session.starts_at)
    from audition_sessions session
    where session.project_id = form_row.project_id
      and session.is_published
  ), '[]'::jsonb),
  'slots', coalesce((
    select jsonb_agg(
      to_jsonb(slot) || jsonb_build_object(
        'booked', (
          select count(*)
          from audition_submission_slots booking
          join audition_submissions submission on submission.id = booking.submission_id
          where booking.slot_id = slot.id
            and submission.cancelled_at is null
        )
      )
      order by slot.starts_at
    )
    from audition_slots slot
    join audition_sessions session on session.id = slot.session_id
    where session.project_id = form_row.project_id
      and session.is_published
      and slot.status = 'open'
  ), '[]'::jsonb)
)
from audition_forms form_row
join projects project on project.id = form_row.project_id
where form_row.staff_preview_token = preview_token;
$$;

revoke all on function app_production_management.get_shared_audition_form_preview(uuid)
from public;
grant execute on function app_production_management.get_shared_audition_form_preview(uuid)
to anon, authenticated, service_role;

commit;
