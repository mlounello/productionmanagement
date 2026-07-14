begin;

alter table app_production_management.people
  add column if not exists performance_interests text[] not null default '{}',
  add column if not exists technical_interests text[] not null default '{}',
  add column if not exists vocal_range text not null default '',
  add column if not exists instruments text not null default '',
  add column if not exists special_skills text not null default '',
  add column if not exists performance_experience text not null default '',
  add column if not exists technical_experience text not null default '',
  add column if not exists certifications_training text not null default '',
  add column if not exists dance_styles text[] not null default '{}',
  add column if not exists dance_experience text not null default '';

create table if not exists app_production_management.profile_verification_codes (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references app_production_management.people(id) on delete cascade,
  context_type text not null,
  context_id uuid not null,
  email text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (context_type in ('audition', 'technical_interest'))
);

create table if not exists app_production_management.public_profile_sessions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references app_production_management.people(id) on delete cascade,
  context_type text not null,
  context_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  check (context_type in ('audition', 'technical_interest'))
);

create table if not exists app_production_management.technical_interest_forms (
  id uuid primary key default gen_random_uuid(),
  public_token uuid not null unique default gen_random_uuid(),
  title text not null default 'Siena Theatre Technical Interest Form',
  description text not null default '',
  status text not null default 'published',
  technical_options text[] not null default '{}',
  vocal_range_options text[] not null default '{}',
  dance_style_options text[] not null default '{}',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('draft', 'published', 'archived'))
);

create table if not exists app_production_management.technical_interest_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references app_production_management.technical_interest_forms(id) on delete restrict,
  person_id uuid not null references app_production_management.people(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  profile_snapshot jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now()
);

create table if not exists app_production_management.profile_intake_history (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references app_production_management.people(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  submitted_values jsonb not null default '{}'::jsonb,
  applied_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (source_type in ('audition', 'technical_interest', 'staff_update'))
);

create table if not exists app_production_management.role_acceptance_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_type text not null,
  version integer not null default 1,
  active boolean not null default true,
  introduction text not null default '',
  sections jsonb not null default '[]'::jsonb,
  credit_options text[] not null default array['0 Credits','1 Credit','2 Credits','3 Credits','Unsure - staff will follow up'],
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (template_type in ('cast', 'crew')),
  unique(template_type, version)
);

create table if not exists app_production_management.role_acceptance_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects(id) on delete cascade,
  role_assignment_id uuid not null references app_production_management.role_assignments(id) on delete cascade,
  person_id uuid not null references app_production_management.people(id) on delete cascade,
  template_id uuid not null references app_production_management.role_acceptance_templates(id) on delete restrict,
  public_token uuid not null unique default gen_random_uuid(),
  status text not null default 'draft',
  template_snapshot jsonb not null,
  answers jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  opened_at timestamptz,
  submitted_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  expires_at timestamptz,
  reminder_count integer not null default 0,
  last_reminded_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('draft','sent','opened','submitted','accepted','changes_needed','declined','expired','waived')),
  unique(role_assignment_id)
);

alter table app_production_management.role_assignments
  add column if not exists acceptance_required boolean not null default false,
  add column if not exists onboarding_status text not null default 'not_started',
  add column if not exists onboarding_checklist jsonb not null default '{}'::jsonb;

alter table app_production_management.role_assignments drop constraint if exists role_assignments_onboarding_status_check;
alter table app_production_management.role_assignments add constraint role_assignments_onboarding_status_check
  check (onboarding_status in ('not_started','acceptance_pending','accepted','onboarding','publicity_pending','complete','skipped','attention'));

insert into app_production_management.technical_interest_forms
  (title, description, technical_options, vocal_range_options, dance_style_options)
select
  'Siena Theatre Technical Interest Form',
  'Tell us which backstage and production areas interest you. If you already have a Siena Theatre profile, verify it to load and update your saved information.',
  array['Stage Management','Lighting','Sound','Video/Projection','Carpentry/Scenic Construction','Costumes/Wardrobe','Stage Crew/Run Crew','Dramaturgy','House Management','Marketing/Public Relations','Other'],
  array['Soprano (C4-A5)','Mezzo-Soprano (A3-F5)','Alto (F3-D5)','Tenor (B2-G4)','Baritone (G2-E4)','Bass (E2-C4)','Unknown','Other'],
  array['Ballet','Jazz','Tap','Hip-Hop','Contemporary','Modern','Musical Theatre','Ballroom/Partner Dance','Other','No formal dance experience']
where not exists (select 1 from app_production_management.technical_interest_forms);

insert into app_production_management.role_acceptance_templates (name, template_type, introduction, sections)
select 'Siena Student Cast Agreement', 'cast',
  'Review your production schedule, expectations, confidentiality commitments, and role offer. Your acceptance records the exact version shown here.',
  jsonb_build_array(
    jsonb_build_object('key','rehearsal_schedule','title','Rehearsal Schedule','body','Review the project rehearsal schedule supplied by the production manager and confirm that you can attend as required.','acknowledgement','I have reviewed the rehearsal schedule and agree to be available as required.','requires_response',true),
    jsonb_build_object('key','rehearsal_preparation','title','Preparation for Rehearsals','body','Arrive prepared for movement and collaborative work, wear safe and appropriate clothing and footwear, follow good hygiene practices, bring water, and keep prepared food outside the rehearsal room unless instructed otherwise.','acknowledgement','I have read and agree to the rehearsal preparation expectations.','requires_response',true),
    jsonb_build_object('key','tech_schedule','title','Tech Week and Dress Schedule','body','Review all mandatory technical and dress rehearsals. Students are responsible for communicating class conflicts to instructors and remaining current with coursework.','acknowledgement','I have reviewed the tech and dress schedule and confirm my availability.','requires_response',true),
    jsonb_build_object('key','performance_strike','title','Performance Dates and Strike','body','Review all mandatory previews, performances, and strike calls supplied by the production manager.','acknowledgement','I have reviewed the performance and strike schedule and confirm my availability.','requires_response',true),
    jsonb_build_object('key','confidentiality','title','Confidentiality and Protection of the Rehearsal Process','body','Treat the rehearsal space and creative process with respect. Do not share private discussions, creative decisions, personal contributions, photographs, video, or recordings outside the company without explicit permission. Respect the privacy and boundaries of fellow cast and crew members.','acknowledgement','I have read and agree to the confidentiality and rehearsal-process expectations.','requires_response',true)
  )
where not exists (select 1 from app_production_management.role_acceptance_templates where template_type='cast');

insert into app_production_management.role_acceptance_templates (name, template_type, introduction, sections)
select 'Siena Student Technical Crew Agreement', 'crew',
  'As a member of the technical crew, your participation requires professionalism, dedication, safety, respect, and appropriate handling of confidential production information.',
  jsonb_build_array(
    jsonb_build_object('key','confidentiality','title','Confidentiality Agreement','body','Information shared within the production, especially in production meetings, is confidential and limited to crew members whose involvement is directly relevant. Do not disclose production information or personal information about participants outside the designated crew. Questions should be brought to the Production Manager.','acknowledgement','I have read and agree to the confidentiality agreement.','requires_response',true),
    jsonb_build_object('key','consequences','title','Consequences of Non-Compliance','body','Failure to follow the confidentiality agreement may result in referral to the Dean of Students Office and/or a failing grade for the production role.','acknowledgement','I understand the consequences of non-compliance.','requires_response',true)
  )
where not exists (select 1 from app_production_management.role_acceptance_templates where template_type='crew');

drop trigger if exists set_updated_at on app_production_management.technical_interest_forms;
create trigger set_updated_at before update on app_production_management.technical_interest_forms for each row execute function app_production_management.set_updated_at();
drop trigger if exists set_updated_at on app_production_management.role_acceptance_templates;
create trigger set_updated_at before update on app_production_management.role_acceptance_templates for each row execute function app_production_management.set_updated_at();
drop trigger if exists set_updated_at on app_production_management.role_acceptance_requests;
create trigger set_updated_at before update on app_production_management.role_acceptance_requests for each row execute function app_production_management.set_updated_at();

alter table app_production_management.profile_verification_codes enable row level security;
alter table app_production_management.public_profile_sessions enable row level security;
alter table app_production_management.technical_interest_forms enable row level security;
alter table app_production_management.technical_interest_submissions enable row level security;
alter table app_production_management.profile_intake_history enable row level security;
alter table app_production_management.role_acceptance_templates enable row level security;
alter table app_production_management.role_acceptance_requests enable row level security;

create policy "staff manage technical interest forms" on app_production_management.technical_interest_forms for all to authenticated using (app_production_management.has_app_role(array['admin','producer'])) with check (app_production_management.has_app_role(array['admin','producer']));
create policy "staff read technical interest submissions" on app_production_management.technical_interest_submissions for select to authenticated using (app_production_management.has_app_role(array['admin','producer']));
create policy "staff read profile intake history" on app_production_management.profile_intake_history for select to authenticated using (app_production_management.has_app_role(array['admin','producer']));
create policy "staff manage acceptance templates" on app_production_management.role_acceptance_templates for all to authenticated using (app_production_management.has_app_role(array['admin','producer'])) with check (app_production_management.has_app_role(array['admin','producer']));
create policy "project staff manage acceptance requests" on app_production_management.role_acceptance_requests for all to authenticated
using (app_production_management.has_project_role(project_id,array['project_manager','producer','department_head','staff']) or app_production_management.has_app_role(array['admin','producer']))
with check (app_production_management.has_project_role(project_id,array['project_manager','producer','department_head','staff']) or app_production_management.has_app_role(array['admin','producer']));

grant select,insert,update,delete on app_production_management.technical_interest_forms to authenticated, service_role;
grant select on app_production_management.technical_interest_submissions, app_production_management.profile_intake_history to authenticated;
grant select,insert,update,delete on app_production_management.technical_interest_submissions, app_production_management.profile_intake_history to service_role;
grant select,insert,update,delete on app_production_management.profile_verification_codes, app_production_management.public_profile_sessions to service_role;
grant select,insert,update,delete on app_production_management.role_acceptance_templates, app_production_management.role_acceptance_requests to authenticated, service_role;
grant select,update on app_production_management.people to service_role;
grant select,update on app_production_management.role_assignments to service_role;

create or replace function app_production_management.update_my_profile_enrichment(
  new_performance_interests text[], new_technical_interests text[], new_vocal_range text, new_instruments text,
  new_special_skills text, new_performance_experience text, new_technical_experience text,
  new_certifications_training text, new_dance_styles text[], new_dance_experience text
) returns uuid language plpgsql security definer set search_path=app_production_management,public as $$
declare profile_id uuid;
begin
  select id into profile_id from people where auth_user_id=auth.uid() limit 1 for update;
  if profile_id is null then raise exception 'Your person profile is not connected.'; end if;
  update people set performance_interests=coalesce(new_performance_interests,'{}'),technical_interests=coalesce(new_technical_interests,'{}'),vocal_range=coalesce(new_vocal_range,''),instruments=coalesce(new_instruments,''),special_skills=coalesce(new_special_skills,''),performance_experience=coalesce(new_performance_experience,''),technical_experience=coalesce(new_technical_experience,''),certifications_training=coalesce(new_certifications_training,''),dance_styles=coalesce(new_dance_styles,'{}'),dance_experience=coalesce(new_dance_experience,'') where id=profile_id;
  return profile_id;
end;$$;
revoke all on function app_production_management.update_my_profile_enrichment(text[],text[],text,text,text,text,text,text,text[],text) from public;
grant execute on function app_production_management.update_my_profile_enrichment(text[],text[],text,text,text,text,text,text,text[],text) to authenticated;

commit;
