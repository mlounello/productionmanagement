begin;
update app_production_management.email_templates
set body_template=body_template||'<p><a href="{{callback_response_url}}">Choose or accept your callback time</a></p>',
    updated_at=now()
where active
  and usage_tags @> array['audition_callback']::text[]
  and body_template not like '%{{callback_response_url}}%';
commit;
