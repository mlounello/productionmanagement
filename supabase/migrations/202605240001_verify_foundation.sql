select
  'app registered' as check_name,
  exists (
    select 1
    from core.apps
    where app_id = 'production_management'
  ) as ok
union all
select
  'roles registered' as check_name,
  (
    select count(*)
    from core.app_roles
    where app_id = 'production_management'
      and role in ('admin', 'producer', 'staff', 'faculty', 'guest')
  ) = 5 as ok
union all
select
  'schema exists' as check_name,
  exists (
    select 1
    from information_schema.schemata
    where schema_name = 'app_production_management'
  ) as ok
union all
select
  'foundation tables exist' as check_name,
  (
    select count(*)
    from information_schema.tables
    where table_schema = 'app_production_management'
      and table_name in (
        'projects',
        'people',
        'project_memberships',
        'project_roles',
        'role_assignments',
        'calendar_items',
        'run_of_show_items',
        'audition_sessions',
        'audition_slots',
        'audition_forms',
        'audition_submissions',
        'email_templates',
        'email_messages',
        'profile_accomplishments',
        'external_links',
        'audit_log'
      )
  ) = 16 as ok
union all
select
  'rls enabled' as check_name,
  not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app_production_management'
      and c.relkind = 'r'
      and c.relrowsecurity = false
  ) as ok;
