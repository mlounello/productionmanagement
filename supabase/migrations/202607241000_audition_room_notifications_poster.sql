begin;

-- Production Management uses its elevated integration credential for Theatre
-- Budget reads. Cross-schema table privileges must be explicit even when RLS is
-- bypassed by that credential.
grant usage on schema app_theatre_budget to service_role, postgres;
grant select on app_theatre_budget.guest_artists to service_role, postgres;

alter table app_production_management.projects
  add column if not exists poster_image_url text not null default '';

create table if not exists app_production_management.audition_character_reads (
  submission_id uuid not null references app_production_management.audition_submissions(id) on delete cascade,
  project_role_id uuid not null references app_production_management.project_roles(id) on delete cascade,
  marked_by uuid references auth.users(id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (submission_id, project_role_id)
);

grant select, insert, update, delete
  on app_production_management.audition_character_reads
  to authenticated, service_role;

alter table app_production_management.audition_character_reads enable row level security;

drop policy if exists "audition staff manage character reads"
  on app_production_management.audition_character_reads;
create policy "audition staff manage character reads"
on app_production_management.audition_character_reads
for all to authenticated
using (
  exists (
    select 1
    from app_production_management.audition_submissions submission
    where submission.id = submission_id
      and app_production_management.can_manage_auditions(submission.project_id)
  )
)
with check (
  exists (
    select 1
    from app_production_management.audition_submissions submission
    where submission.id = submission_id
      and app_production_management.can_manage_auditions(submission.project_id)
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'show-posters',
  'show-posters',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

grant usage on schema app_playbill to service_role, postgres;
grant select on app_playbill.shows to service_role, postgres;
grant select, update on app_playbill.programs to service_role, postgres;

commit;
