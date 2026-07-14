begin;

create table if not exists app_production_management.communication_campaigns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects (id) on delete cascade,
  template_id uuid references app_production_management.email_templates (id) on delete set null,
  name text not null,
  message_type text not null default 'custom',
  subject_template text not null,
  body_template text not null,
  audience_description text not null default '',
  audience_filter jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  sent_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (message_type in ('cast_announcement', 'crew_announcement', 'role_confirmation', 'audition_reminder', 'audition_callback', 'recognition', 'custom')),
  check (status in ('draft', 'sending', 'sent', 'partial', 'cancelled'))
);

create table if not exists app_production_management.communication_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references app_production_management.communication_campaigns (id) on delete cascade,
  person_id uuid references app_production_management.people (id) on delete set null,
  role_assignment_id uuid references app_production_management.role_assignments (id) on delete set null,
  audition_submission_id uuid references app_production_management.audition_submissions (id) on delete set null,
  to_email text not null,
  display_name text not null default '',
  role_name text not null default '',
  role_group text not null default '',
  subject text not null,
  body text not null,
  status text not null default 'draft',
  provider_message_id text,
  error_message text not null default '',
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('draft', 'sending', 'sent', 'failed', 'skipped'))
);

create unique index if not exists communication_recipients_campaign_email_idx
  on app_production_management.communication_recipients (campaign_id, lower(to_email));
create index if not exists communication_campaigns_project_created_idx
  on app_production_management.communication_campaigns (project_id, created_at desc);
create index if not exists communication_recipients_campaign_status_idx
  on app_production_management.communication_recipients (campaign_id, status);

alter table app_production_management.email_messages
  add column if not exists campaign_id uuid references app_production_management.communication_campaigns (id) on delete set null,
  add column if not exists campaign_recipient_id uuid references app_production_management.communication_recipients (id) on delete set null;

create unique index if not exists email_messages_active_campaign_recipient_idx
  on app_production_management.email_messages (campaign_recipient_id)
  where campaign_recipient_id is not null and status in ('queued', 'sent');

alter table app_production_management.profile_accomplishments
  add column if not exists role_assignment_id uuid references app_production_management.role_assignments (id) on delete set null,
  add column if not exists visibility text not null default 'client_visible',
  add column if not exists announcement_campaign_id uuid references app_production_management.communication_campaigns (id) on delete set null,
  add column if not exists notified_at timestamptz;

alter table app_production_management.profile_accomplishments
  drop constraint if exists profile_accomplishments_visibility_check;
alter table app_production_management.profile_accomplishments
  add constraint profile_accomplishments_visibility_check check (visibility in ('client_visible', 'management_only'));

drop trigger if exists set_updated_at on app_production_management.communication_campaigns;
create trigger set_updated_at before update on app_production_management.communication_campaigns
for each row execute function app_production_management.set_updated_at();
drop trigger if exists set_updated_at on app_production_management.communication_recipients;
create trigger set_updated_at before update on app_production_management.communication_recipients
for each row execute function app_production_management.set_updated_at();

alter table app_production_management.communication_campaigns enable row level security;
alter table app_production_management.communication_recipients enable row level security;

drop policy if exists "project communication managers" on app_production_management.communication_campaigns;
create policy "project communication managers" on app_production_management.communication_campaigns
for all to authenticated
using (app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head', 'staff']) or app_production_management.has_app_role(array['admin', 'producer']))
with check (app_production_management.has_project_role(project_id, array['project_manager', 'producer', 'department_head', 'staff']) or app_production_management.has_app_role(array['admin', 'producer']));

drop policy if exists "project communication recipient managers" on app_production_management.communication_recipients;
create policy "project communication recipient managers" on app_production_management.communication_recipients
for all to authenticated
using (exists (select 1 from app_production_management.communication_campaigns c where c.id = campaign_id and (app_production_management.has_project_role(c.project_id, array['project_manager', 'producer', 'department_head', 'staff']) or app_production_management.has_app_role(array['admin', 'producer']))))
with check (exists (select 1 from app_production_management.communication_campaigns c where c.id = campaign_id and (app_production_management.has_project_role(c.project_id, array['project_manager', 'producer', 'department_head', 'staff']) or app_production_management.has_app_role(array['admin', 'producer']))));

grant select, insert, update, delete on app_production_management.communication_campaigns to authenticated;
grant select, insert, update, delete on app_production_management.communication_recipients to authenticated;
grant select, insert, update, delete on app_production_management.communication_campaigns to service_role;
grant select, insert, update, delete on app_production_management.communication_recipients to service_role;
grant select, insert, update on app_production_management.email_messages to authenticated;
grant select, insert, update on app_production_management.email_messages to service_role;
grant select, insert, update, delete on app_production_management.profile_accomplishments to authenticated;

drop policy if exists "accomplishments read own profile" on app_production_management.profile_accomplishments;
create policy "accomplishments read own profile" on app_production_management.profile_accomplishments
for select to authenticated
using (
  visibility = 'client_visible'
  and exists (select 1 from app_production_management.people person where person.id = person_id and person.auth_user_id = auth.uid())
);

notify pgrst, 'reload schema';
commit;
