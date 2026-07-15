begin;

update app_production_management.audition_form_fields
set help_text='Published callback dates from this project''s Audition & Callback Blocks appear here automatically.'
where field_key='callback_availability'
  and help_text='Customize this question with the callback date and time.';

commit;
