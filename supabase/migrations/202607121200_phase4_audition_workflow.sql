-- Phase 4: customizable audition forms, flexible booking, restricted review,
-- durable-person matching, reviewer notes, files, and selective export audit.

alter table app_production_management.audition_forms
  add column if not exists public_token uuid not null default gen_random_uuid(),
  add column if not exists version integer not null default 1,
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists published_at timestamptz,
  add column if not exists closes_at timestamptz,
  add column if not exists allow_reschedule boolean not null default true,
  add column if not exists allow_cancel boolean not null default true;

create unique index if not exists uq_audition_forms_public_token
  on app_production_management.audition_forms (public_token);

create table if not exists app_production_management.audition_form_sections (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references app_production_management.audition_forms (id) on delete cascade,
  title text not null,
  description text not null default '',
  section_key text not null,
  section_type text not null default 'standard',
  sort_order integer not null default 0,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (form_id, section_key)
);

alter table app_production_management.audition_form_fields
  add column if not exists section_key text not null default 'general',
  add column if not exists help_text text not null default '',
  add column if not exists placeholder text not null default '',
  add column if not exists sensitivity text not null default 'standard',
  add column if not exists profile_field text not null default '',
  add column if not exists conditional_logic jsonb not null default '{}'::jsonb,
  add column if not exists export_group text not null default 'standard',
  add column if not exists settings jsonb not null default '{}'::jsonb;

alter table app_production_management.audition_sessions
  add column if not exists session_type text not null default 'appointments',
  add column if not exists booking_mode text not null default 'self_book',
  add column if not exists capacity integer,
  add column if not exists is_published boolean not null default true,
  add column if not exists booking_opens_at timestamptz,
  add column if not exists booking_closes_at timestamptz,
  add column if not exists reschedule_deadline timestamptz,
  add column if not exists cancel_deadline timestamptz,
  add column if not exists settings jsonb not null default '{}'::jsonb;

alter table app_production_management.audition_slots
  add column if not exists label text not null default '',
  add column if not exists slot_type text not null default 'appointment',
  add column if not exists self_bookable boolean not null default true,
  add column if not exists status text not null default 'open',
  add column if not exists instructions text not null default '',
  add column if not exists settings jsonb not null default '{}'::jsonb;

alter table app_production_management.audition_submissions
  add column if not exists applicant_token uuid not null default gen_random_uuid(),
  add column if not exists applicant_email text not null default '',
  add column if not exists form_version integer not null default 1,
  add column if not exists duplicate_status text not null default 'clear',
  add column if not exists duplicate_candidates jsonb not null default '[]'::jsonb,
  add column if not exists audition_status text not null default 'registered',
  add column if not exists callback_status text not null default 'not_reviewed',
  add column if not exists casting_status text not null default 'not_reviewed',
  add column if not exists private_notes text not null default '',
  add column if not exists scheduled_starts_at timestamptz,
  add column if not exists scheduled_ends_at timestamptz,
  add column if not exists schedule_notes text not null default '',
  add column if not exists checked_in_at timestamptz,
  add column if not exists cancelled_at timestamptz;

create unique index if not exists uq_audition_submissions_applicant_token
  on app_production_management.audition_submissions (applicant_token);

create table if not exists app_production_management.audition_reviewer_permissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reviewer_role text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reviewer_role in ('director', 'production_manager', 'intimacy_staff')),
  unique (project_id, user_id, reviewer_role)
);

create table if not exists app_production_management.audition_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references app_production_management.audition_submissions (id) on delete cascade,
  reviewer_user_id uuid not null references auth.users (id) on delete cascade,
  rubric jsonb not null default '{}'::jsonb,
  notes text not null default '',
  recommendation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, reviewer_user_id)
);

create table if not exists app_production_management.audition_files (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references app_production_management.audition_submissions (id) on delete cascade,
  field_key text not null,
  file_name text not null,
  content_type text not null,
  file_size integer not null,
  file_data bytea not null,
  created_at timestamptz not null default now(),
  check (file_size > 0 and file_size <= 5242880)
);

create table if not exists app_production_management.audition_export_audit (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects (id) on delete cascade,
  form_id uuid references app_production_management.audition_forms (id) on delete set null,
  generated_by uuid references auth.users (id) on delete set null,
  export_type text not null,
  submission_ids uuid[] not null default '{}',
  included_fields text[] not null default '{}',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function app_production_management.can_manage_auditions(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app_production_management, core, public
as $$
  select app_production_management.has_app_role(array['admin'])
    or app_production_management.has_project_role(target_project_id, array['project_manager', 'producer'])
    or exists (
      select 1 from app_production_management.audition_reviewer_permissions arp
      where arp.project_id = target_project_id and arp.user_id = auth.uid()
        and arp.active and arp.reviewer_role in ('director', 'production_manager')
    );
$$;

create or replace function app_production_management.can_review_auditions(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app_production_management, core, public
as $$
  select app_production_management.can_manage_auditions(target_project_id)
    or exists (
      select 1 from app_production_management.audition_reviewer_permissions arp
      where arp.project_id = target_project_id and arp.user_id = auth.uid()
        and arp.active and arp.reviewer_role = 'intimacy_staff'
    );
$$;

create or replace function app_production_management.get_public_audition_form(form_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = app_production_management, public
as $$
  select jsonb_build_object(
    'form', to_jsonb(f),
    'project', jsonb_build_object('id', p.id, 'title', p.title),
    'sections', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from audition_form_sections s where s.form_id = f.id), '[]'::jsonb),
    'fields', coalesce((select jsonb_agg(to_jsonb(ff) order by ff.sort_order) from audition_form_fields ff where ff.form_id = f.id), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'role_group', r.role_group) order by r.name) from project_roles r where r.project_id = f.project_id), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from audition_sessions x where x.project_id = f.project_id and x.is_published and (x.booking_opens_at is null or x.booking_opens_at <= now()) and (x.booking_closes_at is null or x.booking_closes_at > now())), '[]'::jsonb),
    'slots', coalesce((select jsonb_agg(to_jsonb(sl) || jsonb_build_object('booked', (select count(*) from audition_submissions sub where sub.slot_id = sl.id and sub.cancelled_at is null)) order by sl.starts_at) from audition_slots sl join audition_sessions sx on sx.id = sl.session_id where sx.project_id = f.project_id and sx.is_published and sl.status = 'open' and (sx.booking_opens_at is null or sx.booking_opens_at <= now()) and (sx.booking_closes_at is null or sx.booking_closes_at > now())), '[]'::jsonb)
  )
  from audition_forms f
  join projects p on p.id = f.project_id
  where f.public_token = form_token and f.status = 'published'
    and (f.closes_at is null or f.closes_at > now());
$$;

create or replace function app_production_management.submit_public_audition(
  form_token uuid,
  answer_payload jsonb,
  selected_slot_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = app_production_management, public
as $$
declare
  target_form audition_forms;
  target_slot audition_slots;
  normalized_email text;
  applicant_name text;
  matched_person people;
  new_person_id uuid;
  candidate_rows jsonb := '[]'::jsonb;
  duplicate_state text := 'clear';
  created_submission audition_submissions;
begin
  select * into target_form from audition_forms
    where public_token = form_token and status = 'published'
      and (closes_at is null or closes_at > now());
  if target_form.id is null then raise exception 'Audition form is unavailable.'; end if;

  normalized_email := lower(trim(coalesce(answer_payload->>'email', '')));
  applicant_name := trim(coalesce(answer_payload->>'full_name', ''));
  if normalized_email = '' or applicant_name = '' then raise exception 'Name and email are required.'; end if;

  if selected_slot_id is not null then
    select sl.* into target_slot from audition_slots sl
      join audition_sessions sx on sx.id = sl.session_id
      where sl.id = selected_slot_id and sx.project_id = target_form.project_id
        and sx.is_published and sl.status = 'open' and sl.self_bookable
      for update;
    if target_slot.id is null then raise exception 'That audition slot is unavailable.'; end if;
    if (select count(*) from audition_submissions where slot_id = target_slot.id and cancelled_at is null) >= target_slot.capacity then
      raise exception 'That audition slot is full.';
    end if;
  end if;

  select * into matched_person from people where lower(email) = normalized_email limit 1;
  if matched_person.id is not null then
    new_person_id := matched_person.id;
  else
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'full_name', full_name, 'email', email)), '[]'::jsonb)
      into candidate_rows from people where lower(full_name) = lower(applicant_name) limit 10;
    if jsonb_array_length(candidate_rows) > 0 then duplicate_state := 'needs_review'; end if;
    insert into people (full_name, preferred_name, email, phone, pronouns, affiliation, person_type)
    values (
      applicant_name,
      coalesce(answer_payload->>'preferred_name', ''),
      normalized_email,
      coalesce(answer_payload->>'phone', ''),
      coalesce(answer_payload->>'pronouns', ''),
      case when coalesce(answer_payload->>'graduation_year', '') <> '' then 'Siena ' || (answer_payload->>'graduation_year') else '' end,
      'student'
    ) returning id into new_person_id;
  end if;

  insert into audition_submissions (project_id, form_id, slot_id, person_id, answers, applicant_email, form_version, duplicate_status, duplicate_candidates)
  values (target_form.project_id, target_form.id, selected_slot_id, new_person_id, answer_payload, normalized_email, target_form.version, duplicate_state, candidate_rows)
  returning * into created_submission;

  return jsonb_build_object('submission_id', created_submission.id, 'access_token', created_submission.applicant_token, 'duplicate_status', duplicate_state);
end;
$$;

create or replace function app_production_management.manage_public_audition_submission(
  access_token uuid,
  requested_action text,
  selected_slot_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = app_production_management, public
as $$
declare
  target audition_submissions;
  target_form audition_forms;
  target_slot audition_slots;
  current_session audition_sessions;
begin
  select * into target from audition_submissions where applicant_token = access_token for update;
  if target.id is null then raise exception 'Submission not found.'; end if;
  select * into target_form from audition_forms where id = target.form_id;
  select sx.* into current_session from audition_sessions sx join audition_slots sl on sl.session_id = sx.id where sl.id = target.slot_id;
  if requested_action = 'cancel' then
    if not target_form.allow_cancel then raise exception 'Cancellation is disabled.'; end if;
    if current_session.cancel_deadline is not null and current_session.cancel_deadline <= now() then raise exception 'The cancellation deadline has passed.'; end if;
    update audition_submissions set cancelled_at = now(), status = 'cancelled' where id = target.id;
  elsif requested_action = 'reschedule' then
    if not target_form.allow_reschedule then raise exception 'Rescheduling is disabled.'; end if;
    if current_session.reschedule_deadline is not null and current_session.reschedule_deadline <= now() then raise exception 'The rescheduling deadline has passed.'; end if;
    select sl.* into target_slot from audition_slots sl join audition_sessions sx on sx.id = sl.session_id
      where sl.id = selected_slot_id and sx.project_id = target.project_id and sl.status = 'open' and sl.self_bookable for update;
    if target_slot.id is null then raise exception 'That audition slot is unavailable.'; end if;
    if (select count(*) from audition_submissions where slot_id = target_slot.id and cancelled_at is null and id <> target.id) >= target_slot.capacity then raise exception 'That audition slot is full.'; end if;
    update audition_submissions set slot_id = selected_slot_id, cancelled_at = null, status = 'submitted' where id = target.id;
  else raise exception 'Unsupported action.';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function app_production_management.upload_public_audition_file(
  access_token uuid,
  target_field_key text,
  upload_name text,
  upload_type text,
  upload_data bytea
)
returns uuid
language plpgsql
security definer
set search_path = app_production_management, public
as $$
declare target_submission uuid; created_id uuid;
begin
  select id into target_submission from audition_submissions where applicant_token = access_token;
  if target_submission is null then raise exception 'Submission not found.'; end if;
  if octet_length(upload_data) > 5242880 then raise exception 'File exceeds 5 MB.'; end if;
  insert into audition_files (submission_id, field_key, file_name, content_type, file_size, file_data)
  values (target_submission, target_field_key, upload_name, upload_type, octet_length(upload_data), upload_data)
  returning id into created_id;
  return created_id;
end;
$$;

grant execute on function app_production_management.get_public_audition_form(uuid) to anon, authenticated;
grant execute on function app_production_management.submit_public_audition(uuid, jsonb, uuid) to anon, authenticated;
grant execute on function app_production_management.manage_public_audition_submission(uuid, text, uuid) to anon, authenticated;
grant execute on function app_production_management.upload_public_audition_file(uuid, text, text, text, bytea) to anon, authenticated;

alter table app_production_management.audition_form_sections enable row level security;
alter table app_production_management.audition_reviewer_permissions enable row level security;
alter table app_production_management.audition_reviews enable row level security;
alter table app_production_management.audition_files enable row level security;
alter table app_production_management.audition_export_audit enable row level security;

drop policy if exists "project scoped audition sessions" on app_production_management.audition_sessions;
drop policy if exists "authenticated manage audition slots" on app_production_management.audition_slots;
drop policy if exists "project scoped audition forms" on app_production_management.audition_forms;
drop policy if exists "authenticated manage audition fields" on app_production_management.audition_form_fields;
drop policy if exists "project scoped audition submissions" on app_production_management.audition_submissions;
drop policy if exists "audition managers sessions" on app_production_management.audition_sessions;
drop policy if exists "audition managers slots" on app_production_management.audition_slots;
drop policy if exists "audition managers forms" on app_production_management.audition_forms;
drop policy if exists "audition managers sections" on app_production_management.audition_form_sections;
drop policy if exists "audition managers fields" on app_production_management.audition_form_fields;
drop policy if exists "audition reviewers submissions" on app_production_management.audition_submissions;
drop policy if exists "audition managers permissions" on app_production_management.audition_reviewer_permissions;
drop policy if exists "audition reviewers reviews" on app_production_management.audition_reviews;
drop policy if exists "audition reviewers files" on app_production_management.audition_files;
drop policy if exists "audition reviewers exports" on app_production_management.audition_export_audit;

create policy "audition managers sessions" on app_production_management.audition_sessions for all to authenticated
  using (app_production_management.can_review_auditions(project_id)) with check (app_production_management.can_manage_auditions(project_id));
create policy "audition managers slots" on app_production_management.audition_slots for all to authenticated
  using (exists (select 1 from app_production_management.audition_sessions s where s.id = session_id and app_production_management.can_review_auditions(s.project_id)))
  with check (exists (select 1 from app_production_management.audition_sessions s where s.id = session_id and app_production_management.can_manage_auditions(s.project_id)));
create policy "audition managers forms" on app_production_management.audition_forms for all to authenticated
  using (app_production_management.can_review_auditions(project_id)) with check (app_production_management.can_manage_auditions(project_id));
create policy "audition managers sections" on app_production_management.audition_form_sections for all to authenticated
  using (exists (select 1 from app_production_management.audition_forms f where f.id = form_id and app_production_management.can_review_auditions(f.project_id)))
  with check (exists (select 1 from app_production_management.audition_forms f where f.id = form_id and app_production_management.can_manage_auditions(f.project_id)));
create policy "audition managers fields" on app_production_management.audition_form_fields for all to authenticated
  using (exists (select 1 from app_production_management.audition_forms f where f.id = form_id and app_production_management.can_review_auditions(f.project_id)))
  with check (exists (select 1 from app_production_management.audition_forms f where f.id = form_id and app_production_management.can_manage_auditions(f.project_id)));
create policy "audition reviewers submissions" on app_production_management.audition_submissions for all to authenticated
  using (app_production_management.can_review_auditions(project_id)) with check (app_production_management.can_manage_auditions(project_id));
create policy "audition managers permissions" on app_production_management.audition_reviewer_permissions for all to authenticated
  using (app_production_management.can_manage_auditions(project_id)) with check (app_production_management.can_manage_auditions(project_id));
create policy "audition reviewers reviews" on app_production_management.audition_reviews for all to authenticated
  using (exists (select 1 from app_production_management.audition_submissions s where s.id = submission_id and app_production_management.can_review_auditions(s.project_id)))
  with check (reviewer_user_id = auth.uid() and exists (select 1 from app_production_management.audition_submissions s where s.id = submission_id and app_production_management.can_review_auditions(s.project_id)));
create policy "audition reviewers files" on app_production_management.audition_files for select to authenticated
  using (exists (select 1 from app_production_management.audition_submissions s where s.id = submission_id and app_production_management.can_review_auditions(s.project_id)));
create policy "audition reviewers exports" on app_production_management.audition_export_audit for all to authenticated
  using (app_production_management.can_review_auditions(project_id)) with check (app_production_management.can_review_auditions(project_id));

do $$
declare target_table regclass;
begin
  foreach target_table in array array[
    'app_production_management.audition_form_sections'::regclass,
    'app_production_management.audition_reviewer_permissions'::regclass,
    'app_production_management.audition_reviews'::regclass
  ] loop
    execute format('drop trigger if exists set_updated_at on %s', target_table);
    execute format('create trigger set_updated_at before update on %s for each row execute function app_production_management.set_updated_at()', target_table);
  end loop;
end $$;
