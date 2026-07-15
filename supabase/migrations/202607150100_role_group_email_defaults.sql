begin;

alter table app_production_management.project_role_group_google_settings
  add column if not exists role_acceptance_email_template_id uuid
    references app_production_management.email_templates (id) on delete set null;

comment on column app_production_management.project_role_group_google_settings.role_acceptance_email_template_id is
  'Explicit email template used for student role-acceptance invitations in this project role group.';

commit;
