begin;

alter table app_production_management.role_assignments
  add column if not exists google_group_membership_checked_at timestamptz;

alter table app_production_management.project_role_group_google_settings
  drop constraint if exists project_role_group_google_settings_last_sync_status_check;

alter table app_production_management.project_role_group_google_settings
  add constraint project_role_group_google_settings_last_sync_status_check check (
    last_sync_status in ('not_attempted', 'synced', 'already_synced', 'verified', 'missing', 'failed', 'disabled', 'skipped')
  );

alter table app_production_management.google_group_action_log
  drop constraint if exists google_group_action_log_action_type_check;

alter table app_production_management.google_group_action_log
  add constraint google_group_action_log_action_type_check check (action_type in (
    'group_created', 'group_creation_failed', 'group_found', 'group_tested',
    'member_added', 'member_add_failed', 'member_already_present',
    'member_removed', 'member_remove_failed', 'member_not_present',
    'membership_checked_present', 'membership_checked_missing', 'membership_check_failed',
    'member_removal_needed',
    'welcome_email_sent', 'welcome_email_failed', 'welcome_email_resent'
  ));

commit;
