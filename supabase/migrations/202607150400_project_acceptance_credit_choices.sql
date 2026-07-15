begin;

alter table app_production_management.project_role_acceptance_settings
  add column if not exists cast_credit_options text[],
  add column if not exists crew_credit_options text[];

-- Freeze today's defaults into every existing customized project so a later
-- global-default edit cannot silently change an in-progress production.
update app_production_management.project_role_acceptance_settings setting
set cast_credit_options = coalesce(
      setting.cast_credit_options,
      (select template.credit_options from app_production_management.role_acceptance_templates template where template.template_type = 'cast' and template.active order by template.version desc limit 1)
    ),
    crew_credit_options = coalesce(
      setting.crew_credit_options,
      (select template.credit_options from app_production_management.role_acceptance_templates template where template.template_type = 'crew' and template.active order by template.version desc limit 1)
    );

comment on column app_production_management.project_role_acceptance_settings.cast_credit_options is
  'Project-owned credit choices shown on cast role acceptance forms; null falls back to the active cast template.';
comment on column app_production_management.project_role_acceptance_settings.crew_credit_options is
  'Project-owned credit choices shown on non-cast role acceptance forms; null falls back to the active crew template.';

commit;
