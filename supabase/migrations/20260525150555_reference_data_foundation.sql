create table if not exists app_production_management.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  parent_department_id uuid references app_production_management.departments (id) on delete set null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_production_management.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  building text not null default '',
  room text not null default '',
  location_type text not null default 'venue',
  capacity integer,
  description text not null default '',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_production_management.reference_values (
  id uuid primary key default gen_random_uuid(),
  reference_type text not null,
  label text not null,
  slug text not null,
  description text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reference_type, slug)
);

alter table app_production_management.projects
  add column if not exists primary_department_id uuid references app_production_management.departments (id) on delete set null,
  add column if not exists primary_location_id uuid references app_production_management.locations (id) on delete set null;

alter table app_production_management.calendar_items
  add column if not exists department_id uuid references app_production_management.departments (id) on delete set null,
  add column if not exists location_id uuid references app_production_management.locations (id) on delete set null;

create index if not exists idx_pm_departments_active_sort
on app_production_management.departments (is_active, sort_order, name);

create index if not exists idx_pm_locations_active_sort
on app_production_management.locations (is_active, sort_order, name);

create index if not exists idx_pm_reference_values_type_active_sort
on app_production_management.reference_values (reference_type, is_active, sort_order, label);

create index if not exists idx_pm_projects_primary_department
on app_production_management.projects (primary_department_id);

create index if not exists idx_pm_projects_primary_location
on app_production_management.projects (primary_location_id);

create index if not exists idx_pm_calendar_department
on app_production_management.calendar_items (department_id);

create index if not exists idx_pm_calendar_location
on app_production_management.calendar_items (location_id);

insert into app_production_management.departments (name, slug, sort_order)
values
  ('Creative Arts', 'creative-arts', 10),
  ('Theatre', 'theatre', 20),
  ('Student Activities', 'student-activities', 30),
  ('Athletics', 'athletics', 40),
  ('Facilities', 'facilities', 50),
  ('Public Safety', 'public-safety', 60),
  ('Marketing & Communications', 'marketing-communications', 70),
  ('Conference Services', 'conference-services', 80),
  ('External Rental', 'external-rental', 90),
  ('Academic Affairs', 'academic-affairs', 100)
on conflict (slug) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into app_production_management.locations (name, slug, building, room, location_type, sort_order)
values
  ('Beaudoin Theatre', 'beaudoin-theatre', 'Foy Hall', 'Beaudoin Theatre', 'theatre', 10),
  ('Foy Hall Lobby / Gallery', 'foy-hall-lobby-gallery', 'Foy Hall', 'Lobby / Gallery', 'venue', 20),
  ('Foy 107 Studio Theatre', 'foy-107-studio-theatre', 'Foy Hall', '107', 'theatre', 30),
  ('UHY Center', 'uhy-center', 'UHY Center', '', 'venue', 40),
  ('MAC', 'mac', 'Marcelle Athletic Complex', '', 'venue', 50),
  ('Hickey Field', 'hickey-field', 'Hickey Field', '', 'field', 60),
  ('Academic Quad', 'academic-quad', 'Academic Quad', '', 'outdoor', 70),
  ('Sarazen Student Union', 'sarazen-student-union', 'Sarazen Student Union', '', 'venue', 80),
  ('Chapel', 'chapel', 'Chapel', '', 'venue', 90),
  ('Serra Hall', 'serra-hall', 'Serra Hall', '', 'venue', 100)
on conflict (slug) do update
set name = excluded.name,
    building = excluded.building,
    room = excluded.room,
    location_type = excluded.location_type,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into app_production_management.reference_values (reference_type, label, slug, sort_order)
values
  ('project_type', 'Theatre production', 'theatre_production', 10),
  ('project_type', 'Campus event', 'campus_event', 20),
  ('project_type', 'Rental', 'rental', 30),
  ('project_type', 'Support job', 'support_job', 40),
  ('project_type', 'Other', 'other', 50),
  ('calendar_item_type', 'Window', 'window', 10),
  ('calendar_item_type', 'Task', 'task', 20),
  ('calendar_item_type', 'Event', 'event', 30),
  ('calendar_item_type', 'Milestone', 'milestone', 40),
  ('calendar_item_type', 'Deadline', 'deadline', 50),
  ('calendar_item_type', 'Run of show', 'run_of_show', 60),
  ('role_group', 'Production team', 'production_team', 10),
  ('role_group', 'Cast', 'cast', 20),
  ('role_group', 'Crew', 'crew', 30),
  ('role_group', 'Designer', 'designer', 40),
  ('role_group', 'Department head', 'department_head', 50),
  ('role_group', 'Staff', 'staff', 60),
  ('role_group', 'Guest artist', 'guest_artist', 70)
on conflict (reference_type, slug) do update
set label = excluded.label,
    sort_order = excluded.sort_order,
    updated_at = now();

do $$
declare
  target_table regclass;
begin
  foreach target_table in array array[
    'app_production_management.departments'::regclass,
    'app_production_management.locations'::regclass,
    'app_production_management.reference_values'::regclass
  ]
  loop
    execute format('drop trigger if exists set_updated_at on %s', target_table);
    execute format(
      'create trigger set_updated_at before update on %s for each row execute function app_production_management.set_updated_at()',
      target_table
    );
  end loop;
end $$;

alter table app_production_management.departments enable row level security;
alter table app_production_management.locations enable row level security;
alter table app_production_management.reference_values enable row level security;

drop policy if exists "reference departments read app members" on app_production_management.departments;
create policy "reference departments read app members" on app_production_management.departments
for select to authenticated
using (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty', 'guest']));

drop policy if exists "reference departments manage producers" on app_production_management.departments;
create policy "reference departments manage producers" on app_production_management.departments
for all to authenticated
using (app_production_management.has_app_role(array['admin', 'producer']))
with check (app_production_management.has_app_role(array['admin', 'producer']));

drop policy if exists "reference locations read app members" on app_production_management.locations;
create policy "reference locations read app members" on app_production_management.locations
for select to authenticated
using (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty', 'guest']));

drop policy if exists "reference locations manage producers" on app_production_management.locations;
create policy "reference locations manage producers" on app_production_management.locations
for all to authenticated
using (app_production_management.has_app_role(array['admin', 'producer']))
with check (app_production_management.has_app_role(array['admin', 'producer']));

drop policy if exists "reference values read app members" on app_production_management.reference_values;
create policy "reference values read app members" on app_production_management.reference_values
for select to authenticated
using (app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty', 'guest']));

drop policy if exists "reference values manage producers" on app_production_management.reference_values;
create policy "reference values manage producers" on app_production_management.reference_values
for all to authenticated
using (app_production_management.has_app_role(array['admin', 'producer']))
with check (app_production_management.has_app_role(array['admin', 'producer']));

grant select, insert, update, delete on app_production_management.departments to authenticated;
grant select, insert, update, delete on app_production_management.locations to authenticated;
grant select, insert, update, delete on app_production_management.reference_values to authenticated;
grant all on app_production_management.departments to service_role;
grant all on app_production_management.locations to service_role;
grant all on app_production_management.reference_values to service_role;
