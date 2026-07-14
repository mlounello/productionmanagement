begin;

alter table app_production_management.email_templates
  add column if not exists usage_tags text[] not null default '{}',
  add column if not exists description text not null default '';

update app_production_management.email_templates
set usage_tags = array[template_type]
where cardinality(usage_tags) = 0;

create index if not exists email_templates_usage_tags_idx
  on app_production_management.email_templates using gin(usage_tags);

insert into app_production_management.email_templates(template_type,name,subject_template,body_template,usage_tags,description)
select 'profile_access','Profile access invitation','Your secure Siena Theatre production profile link','<h1>Siena Theatre Production Management</h1><p>Hello {{person_name}},</p><p>You have been invited to review and update your Siena Theatre production profile, including your contact information, publicity bio, and headshot.</p><p><a href="{{profile_access_url}}">Open My Production Profile</a></p><p>This private link expires in {{expires_in}} and should not be forwarded.</p>',array['profile_access'],'Secure no-account invitation to update a reusable person profile.'
where not exists(select 1 from app_production_management.email_templates where 'profile_access'=any(usage_tags));

insert into app_production_management.email_templates(template_type,name,subject_template,body_template,usage_tags,description)
select 'publicity_reminder','Publicity submission reminder','Publicity items due for {{project_title}}','<h1>{{project_title}} Publicity</h1><p>Hello {{person_name}},</p><p>Please review your production publicity information.</p><p><strong>Still needed:</strong> {{outstanding_items}}</p><ul><li>Bio due: {{bio_due_date}}</li><li>Headshot due: {{headshot_due_date}}</li></ul><p><a href="{{profile_access_url}}">Review My Publicity Profile</a></p>',array['publicity_reminder','profile_update_reminder','submission_reminder'],'Reminder for outstanding profile, bio, and headshot submissions.'
where not exists(select 1 from app_production_management.email_templates where 'publicity_reminder'=any(usage_tags));

insert into app_production_management.email_templates(template_type,name,subject_template,body_template,usage_tags,description)
select 'role_group_welcome','Production role welcome','Welcome to {{project_title}} · {{role_group}}','<h1>Welcome, {{person_name}}!</h1><p>You have been assigned as <strong>{{role_name}}</strong> for <strong>{{project_title}}</strong>.</p><p><a href="{{propared_rolegroup_link}}">Open your Propared Production Book</a></p><p><a href="{{profile_access_url}}">Update your Production Management profile, headshot, and show biography</a></p><p>Production group: <a href="mailto:{{google_group_email}}">{{google_group_email}}</a></p>',array['role_group_welcome'],'Welcome message released during project onboarding.'
where not exists(select 1 from app_production_management.email_templates where 'role_group_welcome'=any(usage_tags) and project_id is null);

insert into app_production_management.email_templates(template_type,name,subject_template,body_template,usage_tags,description)
select 'role_acceptance','Student role acceptance invitation','Role acceptance required: {{project_title}}','<h1>{{project_title}}</h1><p>Hello {{person_name}},</p><p>You have been selected as <strong>{{role_name}}</strong>. Please review and complete the required {{agreement_type}} agreement before production onboarding begins.</p><p><a href="{{role_acceptance_url}}">Review and Accept My Role</a></p><p>This individualized form expires in {{expires_in}}. Contact the production manager if you have questions or need changes.</p>',array['role_acceptance'],'Invitation sent when a student is offered a cast or crew role.'
where not exists(select 1 from app_production_management.email_templates where 'role_acceptance'=any(usage_tags));

insert into app_production_management.email_templates(template_type,name,subject_template,body_template,usage_tags,description)
select 'profile_verification_code','Intake profile verification code','Your Siena Theatre profile verification code','<h1>Siena Theatre Production Management</h1><p>Hello {{person_name}},</p><p>Enter this code to load your saved profile information:</p><h2>{{verification_code}}</h2><p>The code expires in {{expires_in}}. Do not share it with anyone.</p>',array['profile_verification_code'],'Six-digit identity verification used by audition and interest forms.'
where not exists(select 1 from app_production_management.email_templates where 'profile_verification_code'=any(usage_tags));

insert into app_production_management.email_templates(template_type,name,subject_template,body_template,usage_tags,description)
select starter.template_type,starter.name,starter.subject_template,starter.body_template,array[starter.template_type],'Siena starter available to project campaigns.'
from (values
  ('cast_announcement','Cast announcement','{{project_title}} cast announcement','<h3>Hello {{person_name}},</h3><p>We are pleased to share the cast announcement for <strong>{{project_title}}</strong>.</p><p>Your role: <strong>{{role_name}}</strong></p>'),
  ('crew_announcement','Crew announcement','Welcome to the {{project_title}} team','<h3>Hello {{person_name}},</h3><p>Welcome to the <strong>{{project_title}}</strong> production team.</p><p>Your role: <strong>{{role_name}}</strong></p>'),
  ('role_confirmation','Role confirmation','Please confirm your role in {{project_title}}','<h3>Hello {{person_name}},</h3><p>Please review and confirm your assignment as <strong>{{role_name}}</strong> for <strong>{{project_title}}</strong>.</p>'),
  ('audition_reminder','Audition reminder','{{project_title}} audition reminder','<h3>Hello {{person_name}},</h3><p>This is a reminder about your upcoming audition for <strong>{{project_title}}</strong>.</p>'),
  ('audition_callback','Audition callback','{{project_title}} callback invitation','<h3>Hello {{person_name}},</h3><p>We would like to invite you to a callback for <strong>{{project_title}}</strong>.</p>'),
  ('recognition','Recognition','Congratulations on {{recognition_title}}','<h3>Congratulations, {{person_name}}!</h3><p>We are pleased to recognize you for <strong>{{recognition_title}}</strong>.</p>'),
  ('custom','General campaign','A message about {{project_title}}','<h3>Hello {{person_name}},</h3><p></p>')
) as starter(template_type,name,subject_template,body_template)
where not exists(select 1 from app_production_management.email_templates existing where existing.template_type=starter.template_type and existing.project_id is null);

commit;
