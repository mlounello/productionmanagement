create extension if not exists "pgcrypto";

create schema if not exists app_production_management;

grant usage on schema app_production_management to anon;
grant usage on schema app_production_management to authenticated;
grant usage on schema app_production_management to service_role;

insert into core.apps (app_id, name, is_public)
values ('production_management', 'Production Management', false)
on conflict (app_id) do update
set name = excluded.name,
    is_public = excluded.is_public;

insert into core.app_roles (app_id, role, description)
values
  ('production_management', 'admin', 'Full Production Management access.'),
  ('production_management', 'producer', 'Can create and manage assigned production projects.'),
  ('production_management', 'staff', 'Can collaborate on assigned projects.'),
  ('production_management', 'faculty', 'Can review and support assigned projects.'),
  ('production_management', 'guest', 'Limited guest access for assigned work.')
on conflict (app_id, role) do update
set description = excluded.description;

create or replace function app_production_management.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists app_production_management.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  project_type text not null default 'theatre_production',
  status text not null default 'planning',
  description text not null default '',
  venue text not null default '',
  season_label text not null default '',
  starts_on date,
  ends_on date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (project_type in ('theatre_production', 'campus_event', 'rental', 'support_job', 'other')),
  check (status in ('planning', 'active', 'paused', 'completed', 'archived'))
);

create table if not exists app_production_management.people (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users (id) on delete set null,
  first_name text not null default '',
  last_name text not null default '',
  preferred_name text not null default '',
  full_name text not null,
  email text not null default '',
  phone text not null default '',
  pronouns text not null default '',
  affiliation text not null default '',
  person_type text not null default 'person',
  status text not null default 'active',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (person_type in ('student', 'staff', 'faculty', 'guest_artist', 'vendor_contact', 'client', 'person')),
  check (status in ('active', 'inactive', 'archived'))
);

create unique index if not exists uq_people_email_nonblank
on app_production_management.people (lower(email))
where email <> '';

create table if not exists app_production_management.project_memberships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  person_id uuid references app_production_management.people (id) on delete set null,
  role text not null,
  title text not null default '',
  department text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id, role)
);

create table if not exists app_production_management.project_roles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects (id) on delete cascade,
  name text not null,
  role_group text not null default 'production_team',
  department text not null default '',
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name, role_group)
);

create table if not exists app_production_management.role_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects (id) on delete cascade,
  role_id uuid not null references app_production_management.project_roles (id) on delete cascade,
  person_id uuid not null references app_production_management.people (id) on delete cascade,
  status text not null default 'draft',
  confirmation_status text not null default 'not_sent',
  confirmed_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (role_id, person_id),
  check (status in ('draft', 'offered', 'accepted', 'declined', 'withdrawn')),
  check (confirmation_status in ('not_sent', 'sent', 'accepted', 'declined', 'bounced'))
);

create table if not exists app_production_management.calendar_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects (id) on delete cascade,
  parent_id uuid references app_production_management.calendar_items (id) on delete cascade,
  title text not null,
  item_type text not null default 'task',
  status text not null default 'planned',
  department text not null default '',
  location text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  due_at timestamptz,
  all_day boolean not null default false,
  visibility text not null default 'project',
  description text not null default '',
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (item_type in ('window', 'task', 'event', 'milestone', 'deadline', 'run_of_show')),
  check (status in ('planned', 'in_progress', 'blocked', 'completed', 'cancelled')),
  check (visibility in ('private', 'assigned', 'department', 'project', 'public'))
);

create table if not exists app_production_management.calendar_item_assignments (
  id uuid primary key default gen_random_uuid(),
  calendar_item_id uuid not null references app_production_management.calendar_items (id) on delete cascade,
  person_id uuid references app_production_management.people (id) on delete cascade,
  role_assignment_id uuid references app_production_management.role_assignments (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists app_production_management.calendar_item_dependencies (
  id uuid primary key default gen_random_uuid(),
  predecessor_id uuid not null references app_production_management.calendar_items (id) on delete cascade,
  successor_id uuid not null references app_production_management.calendar_items (id) on delete cascade,
  dependency_type text not null default 'finish_to_start',
  created_at timestamptz not null default now(),
  unique (predecessor_id, successor_id),
  check (predecessor_id <> successor_id)
);

create table if not exists app_production_management.calendar_recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  calendar_item_id uuid not null references app_production_management.calendar_items (id) on delete cascade,
  rrule text not null,
  timezone text not null default 'America/New_York',
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calendar_item_id)
);

create table if not exists app_production_management.calendar_occurrences (
  id uuid primary key default gen_random_uuid(),
  calendar_item_id uuid not null references app_production_management.calendar_items (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'scheduled',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_production_management.run_of_show_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects (id) on delete cascade,
  calendar_item_id uuid references app_production_management.calendar_items (id) on delete set null,
  cue_number text not null default '',
  title text not null,
  starts_at timestamptz,
  duration_minutes integer,
  owner_person_id uuid references app_production_management.people (id) on delete set null,
  notes text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_production_management.audition_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects (id) on delete cascade,
  title text not null,
  location text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  slots_per_interval integer not null default 1,
  interval_minutes integer not null default 5,
  instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (slots_per_interval > 0),
  check (interval_minutes > 0)
);

create table if not exists app_production_management.audition_slots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references app_production_management.audition_sessions (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  capacity integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (capacity > 0)
);

create table if not exists app_production_management.audition_forms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects (id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('draft', 'published', 'archived'))
);

create table if not exists app_production_management.audition_form_fields (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references app_production_management.audition_forms (id) on delete cascade,
  label text not null,
  field_key text not null,
  field_type text not null default 'text',
  required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (form_id, field_key)
);

create table if not exists app_production_management.audition_submissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects (id) on delete cascade,
  form_id uuid not null references app_production_management.audition_forms (id) on delete restrict,
  slot_id uuid references app_production_management.audition_slots (id) on delete set null,
  person_id uuid not null references app_production_management.people (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'submitted',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('submitted', 'cancelled', 'no_show', 'checked_in'))
);

create table if not exists app_production_management.email_templates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references app_production_management.projects (id) on delete cascade,
  template_type text not null,
  name text not null,
  subject_template text not null,
  body_template text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_production_management.email_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references app_production_management.projects (id) on delete set null,
  person_id uuid references app_production_management.people (id) on delete set null,
  template_id uuid references app_production_management.email_templates (id) on delete set null,
  message_type text not null,
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'draft',
  provider_message_id text,
  sent_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('draft', 'queued', 'sent', 'failed', 'cancelled'))
);

create table if not exists app_production_management.profile_accomplishments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references app_production_management.people (id) on delete cascade,
  project_id uuid references app_production_management.projects (id) on delete set null,
  accomplishment_type text not null default 'recognition',
  title text not null,
  issuer text not null default '',
  awarded_on date,
  description text not null default '',
  notification_email_id uuid references app_production_management.email_messages (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_production_management.external_links (
  id uuid primary key default gen_random_uuid(),
  local_entity_type text not null,
  local_entity_id uuid not null,
  external_app text not null,
  external_schema text not null,
  external_table text not null,
  external_id text not null,
  sync_direction text not null default 'read_only',
  sync_status text not null default 'linked',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (local_entity_type, local_entity_id, external_app, external_schema, external_table, external_id),
  check (sync_direction in ('read_only', 'push', 'pull', 'bidirectional')),
  check (sync_status in ('linked', 'pending', 'synced', 'conflict', 'disabled'))
);

create table if not exists app_production_management.audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_value jsonb,
  after_value jsonb,
  changed_by uuid references auth.users (id) on delete set null,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_pm_projects_status on app_production_management.projects (status);
create index if not exists idx_pm_people_name on app_production_management.people (full_name);
create index if not exists idx_pm_memberships_project on app_production_management.project_memberships (project_id);
create index if not exists idx_pm_calendar_project_dates on app_production_management.calendar_items (project_id, starts_at, due_at);
create index if not exists idx_pm_calendar_parent on app_production_management.calendar_items (parent_id);
create index if not exists idx_pm_external_links_local on app_production_management.external_links (local_entity_type, local_entity_id);
create index if not exists idx_pm_external_links_external on app_production_management.external_links (external_app, external_schema, external_table, external_id);

create or replace function app_production_management.get_user_role()
returns text
language sql
stable
security definer
set search_path = app_production_management, core, public
as $$
  select coalesce((
    select lower(am.role)
    from core.app_memberships am
    where am.user_id = auth.uid()
      and am.app_id = 'production_management'
      and am.is_active = true
    order by case lower(am.role)
      when 'admin' then 5
      when 'producer' then 4
      when 'staff' then 3
      when 'faculty' then 2
      when 'guest' then 1
      else 0
    end desc
    limit 1
  ), 'none');
$$;

create or replace function app_production_management.has_app_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = app_production_management, core, public
as $$
  select app_production_management.get_user_role() = any(allowed_roles);
$$;

create or replace function app_production_management.is_project_member(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app_production_management, core, public
as $$
  select app_production_management.has_app_role(array['admin'])
    or exists (
      select 1
      from app_production_management.project_memberships pm
      where pm.project_id = target_project_id
        and pm.user_id = auth.uid()
        and pm.active = true
    );
$$;

create or replace function app_production_management.has_project_role(target_project_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = app_production_management, core, public
as $$
  select app_production_management.has_app_role(array['admin'])
    or exists (
      select 1
      from app_production_management.project_memberships pm
      where pm.project_id = target_project_id
        and pm.user_id = auth.uid()
        and pm.active = true
        and pm.role = any(allowed_roles)
    );
$$;

do $$
declare
  target_table regclass;
begin
  foreach target_table in array array[
    'app_production_management.projects'::regclass,
    'app_production_management.people'::regclass,
    'app_production_management.project_memberships'::regclass,
    'app_production_management.project_roles'::regclass,
    'app_production_management.role_assignments'::regclass,
    'app_production_management.calendar_items'::regclass,
    'app_production_management.calendar_recurrence_rules'::regclass,
    'app_production_management.calendar_occurrences'::regclass,
    'app_production_management.run_of_show_items'::regclass,
    'app_production_management.audition_sessions'::regclass,
    'app_production_management.audition_slots'::regclass,
    'app_production_management.audition_forms'::regclass,
    'app_production_management.audition_submissions'::regclass,
    'app_production_management.email_templates'::regclass,
    'app_production_management.email_messages'::regclass,
    'app_production_management.profile_accomplishments'::regclass,
    'app_production_management.external_links'::regclass
  ]
  loop
    execute format('drop trigger if exists set_updated_at on %s', target_table);
    execute format(
      'create trigger set_updated_at before update on %s for each row execute function app_production_management.set_updated_at()',
      target_table
    );
  end loop;
end $$;

alter table app_production_management.projects enable row level security;
alter table app_production_management.people enable row level security;
alter table app_production_management.project_memberships enable row level security;
alter table app_production_management.project_roles enable row level security;
alter table app_production_management.role_assignments enable row level security;
alter table app_production_management.calendar_items enable row level security;
alter table app_production_management.calendar_item_assignments enable row level security;
alter table app_production_management.calendar_item_dependencies enable row level security;
alter table app_production_management.calendar_recurrence_rules enable row level security;
alter table app_production_management.calendar_occurrences enable row level security;
alter table app_production_management.run_of_show_items enable row level security;
alter table app_production_management.audition_sessions enable row level security;
alter table app_production_management.audition_slots enable row level security;
alter table app_production_management.audition_forms enable row level security;
alter table app_production_management.audition_form_fields enable row level security;
alter table app_production_management.audition_submissions enable row level security;
alter table app_production_management.email_templates enable row level security;
alter table app_production_management.email_messages enable row level security;
alter table app_production_management.profile_accomplishments enable row level security;
alter table app_production_management.external_links enable row level security;
alter table app_production_management.audit_log enable row level security;

create policy "projects read members" on app_production_management.projects
for select to authenticated
using (app_production_management.is_project_member(id));

create policy "projects insert producers" on app_production_management.projects
for insert to authenticated
with check (app_production_management.has_app_role(array['admin', 'producer']));

create policy "projects update managers" on app_production_management.projects
for update to authenticated
using (app_production_management.has_project_role(id, array['project_manager', 'producer']))
with check (app_production_management.has_project_role(id, array['project_manager', 'producer']));

create policy "people read app members" on app_production_management.people
for select to authenticated
using (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']));

create policy "people manage staff" on app_production_management.people
for all to authenticated
using (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']))
with check (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']));

create policy "memberships read project" on app_production_management.project_memberships
for select to authenticated
using (app_production_management.is_project_member(project_id));

create policy "memberships manage managers" on app_production_management.project_memberships
for all to authenticated
using (
  app_production_management.has_app_role(array['admin', 'producer'])
  or app_production_management.has_project_role(project_id, array['project_manager', 'producer'])
)
with check (
  app_production_management.has_app_role(array['admin', 'producer'])
  or app_production_management.has_project_role(project_id, array['project_manager', 'producer'])
);

create policy "project scoped read roles" on app_production_management.project_roles
for select to authenticated
using (app_production_management.is_project_member(project_id));

create policy "project scoped manage roles" on app_production_management.project_roles
for all to authenticated
using (app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head']))
with check (app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head']));

create policy "project scoped read assignments" on app_production_management.role_assignments
for select to authenticated
using (app_production_management.is_project_member(project_id));

create policy "project scoped manage assignments" on app_production_management.role_assignments
for all to authenticated
using (app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head']))
with check (app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head']));

create policy "project scoped read calendar" on app_production_management.calendar_items
for select to authenticated
using (app_production_management.is_project_member(project_id));

create policy "project scoped manage calendar" on app_production_management.calendar_items
for all to authenticated
using (app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head', 'staff']))
with check (app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head', 'staff']));

create policy "authenticated read item assignments" on app_production_management.calendar_item_assignments
for select to authenticated
using (true);

create policy "authenticated manage item assignments" on app_production_management.calendar_item_assignments
for all to authenticated
using (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']))
with check (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']));

create policy "authenticated manage item dependencies" on app_production_management.calendar_item_dependencies
for all to authenticated
using (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']))
with check (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']));

create policy "authenticated manage recurrence" on app_production_management.calendar_recurrence_rules
for all to authenticated
using (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']))
with check (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']));

create policy "authenticated manage occurrences" on app_production_management.calendar_occurrences
for all to authenticated
using (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']))
with check (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']));

create policy "project scoped read run of show" on app_production_management.run_of_show_items
for select to authenticated
using (app_production_management.is_project_member(project_id));

create policy "project scoped manage run of show" on app_production_management.run_of_show_items
for all to authenticated
using (app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head', 'staff']))
with check (app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head', 'staff']));

create policy "project scoped audition sessions" on app_production_management.audition_sessions
for all to authenticated
using (app_production_management.is_project_member(project_id))
with check (app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head', 'staff']));

create policy "authenticated manage audition slots" on app_production_management.audition_slots
for all to authenticated
using (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']))
with check (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']));

create policy "project scoped audition forms" on app_production_management.audition_forms
for all to authenticated
using (app_production_management.is_project_member(project_id))
with check (app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head', 'staff']));

create policy "authenticated manage audition fields" on app_production_management.audition_form_fields
for all to authenticated
using (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']))
with check (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']));

create policy "project scoped audition submissions" on app_production_management.audition_submissions
for all to authenticated
using (app_production_management.is_project_member(project_id))
with check (app_production_management.is_project_member(project_id));

create policy "authenticated manage emails" on app_production_management.email_templates
for all to authenticated
using (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']))
with check (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']));

create policy "authenticated manage email messages" on app_production_management.email_messages
for all to authenticated
using (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']))
with check (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']));

create policy "authenticated manage accomplishments" on app_production_management.profile_accomplishments
for all to authenticated
using (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']))
with check (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']));

create policy "authenticated manage external links" on app_production_management.external_links
for all to authenticated
using (app_production_management.has_app_role(array['admin', 'producer']))
with check (app_production_management.has_app_role(array['admin', 'producer']));

create policy "authenticated read audit" on app_production_management.audit_log
for select to authenticated
using (app_production_management.has_app_role(array['admin', 'producer']));

create policy "authenticated insert audit" on app_production_management.audit_log
for insert to authenticated
with check (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty']));

grant select, insert, update, delete on all tables in schema app_production_management to authenticated;
grant usage on all sequences in schema app_production_management to authenticated;
grant execute on all functions in schema app_production_management to authenticated;
