begin;

update app_production_management.role_acceptance_templates template
set sections = template.sections || jsonb_build_array(jsonb_build_object(
  'key','attendance_policy',
  'title','Attendance and Punctuality',
  'body','Rehearsals are required calls, not optional. Cast members must arrive by the stated call time and be ready to work. An absence or late arrival is excused only when approved by the director or production manager. Three unexcused absences may result in removal from the production. Each unexcused late arrival counts as one unexcused absence.',
  'acknowledgement','I understand that three unexcused absences may result in my removal from the production and that each unexcused late arrival counts as one unexcused absence.',
  'requires_response',true
))
where template.template_type='cast'
  and not exists(select 1 from jsonb_array_elements(template.sections) section where section->>'key'='attendance_policy');

update app_production_management.project_role_acceptance_settings setting
set cast_sections = setting.cast_sections || jsonb_build_array(jsonb_build_object(
  'key','attendance_policy',
  'title','Attendance and Punctuality',
  'body','Rehearsals are required calls, not optional. Cast members must arrive by the stated call time and be ready to work. An absence or late arrival is excused only when approved by the director or production manager. Three unexcused absences may result in removal from the production. Each unexcused late arrival counts as one unexcused absence.',
  'acknowledgement','I understand that three unexcused absences may result in my removal from the production and that each unexcused late arrival counts as one unexcused absence.',
  'requires_response',true
))
where setting.cast_sections is not null
  and not exists(select 1 from jsonb_array_elements(setting.cast_sections) section where section->>'key'='attendance_policy');

update app_production_management.email_templates
set body_template=case
  when body_template like '%<p><a href="{{role_acceptance_url}}">%' then replace(body_template,'<p><a href="{{role_acceptance_url}}">','<p><strong>{{attendance_policy}}</strong></p><p><a href="{{role_acceptance_url}}">')
  else body_template || '<p><strong>{{attendance_policy}}</strong></p>'
end
where 'role_acceptance'=any(usage_tags)
  and body_template not like '%{{attendance_policy}}%';

commit;
