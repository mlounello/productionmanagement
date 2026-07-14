begin;

alter table app_production_management.project_role_acceptance_settings
  add column if not exists rehearsal_schedule text not null default '',
  add column if not exists tech_schedule text not null default '',
  add column if not exists performance_schedule text not null default '';

update app_production_management.role_acceptance_templates template
set sections = (
  select jsonb_agg(
    case
      when section->>'key' = 'rehearsal_schedule' and section->>'body' = 'Review the project rehearsal schedule supplied by the production manager and confirm that you can attend as required.' then jsonb_set(section, '{body}', to_jsonb('The project rehearsal schedule is listed in this agreement. Review every listed call and disclose conflicts before accepting the role.'::text))
      when section->>'key' = 'tech_schedule' and section->>'body' = 'Review all mandatory technical and dress rehearsals. Students are responsible for communicating class conflicts to instructors and remaining current with coursework.' then jsonb_set(section, '{body}', to_jsonb('The project technical and dress schedule is listed in this agreement. These calls are mandatory unless an exception is approved in advance. Students remain responsible for communicating with instructors and staying current with coursework.'::text))
      when section->>'key' = 'performance_strike' and section->>'body' = 'Review all mandatory previews, performances, and strike calls supplied by the production manager.' then jsonb_set(section, '{body}', to_jsonb('The project performance and strike schedule is listed in this agreement. Review every listed call and confirm your availability.'::text))
      else section
    end
    order by ordinal
  )
  from jsonb_array_elements(template.sections) with ordinality as item(section, ordinal)
)
where template.template_type = 'cast';

update app_production_management.project_role_acceptance_settings setting
set cast_sections = (
  select jsonb_agg(
    case
      when section->>'key' = 'rehearsal_schedule' and section->>'body' = 'Review the project rehearsal schedule supplied by the production manager and confirm that you can attend as required.' then jsonb_set(section, '{body}', to_jsonb('The project rehearsal schedule is listed in this agreement. Review every listed call and disclose conflicts before accepting the role.'::text))
      when section->>'key' = 'tech_schedule' and section->>'body' = 'Review all mandatory technical and dress rehearsals. Students are responsible for communicating class conflicts to instructors and remaining current with coursework.' then jsonb_set(section, '{body}', to_jsonb('The project technical and dress schedule is listed in this agreement. These calls are mandatory unless an exception is approved in advance. Students remain responsible for communicating with instructors and staying current with coursework.'::text))
      when section->>'key' = 'performance_strike' and section->>'body' = 'Review all mandatory previews, performances, and strike calls supplied by the production manager.' then jsonb_set(section, '{body}', to_jsonb('The project performance and strike schedule is listed in this agreement. Review every listed call and confirm your availability.'::text))
      else section
    end
    order by ordinal
  )
  from jsonb_array_elements(setting.cast_sections) with ordinality as item(section, ordinal)
)
where setting.cast_sections is not null;

commit;
