\set ON_ERROR_STOP on
-- Run only against an empty disposable database. Fixture schemas deliberately
-- fail if they already exist, preventing execution against a real app database.
create schema auth;
create schema app_production_management;
create role authenticated;
create role service_role;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select '10000000-0000-4000-8000-000000000001'::uuid $$;
create function app_production_management.has_app_role(text[]) returns boolean language sql stable as $$ select coalesce(current_setting('test.is_manager',true),'false') = 'true' $$;
create function app_production_management.has_project_role(uuid,text[]) returns boolean language sql stable as $$ select false $$;
create table app_production_management.projects(id uuid primary key);
create table app_production_management.people(id uuid primary key, full_name text);
create table app_production_management.project_roles(id uuid primary key, project_id uuid);
insert into auth.users values ('10000000-0000-4000-8000-000000000001');
insert into app_production_management.projects values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into app_production_management.people values ('10000000-0000-4000-8000-000000000001','Preserved Actor');
insert into app_production_management.project_roles values ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
grant usage on schema auth,app_production_management to authenticated;
grant select on all tables in schema app_production_management to authenticated;
\ir ../supabase/migrations/202609160100_casting_drafts.sql
set role authenticated;
set test.is_manager='true';
insert into app_production_management.casting_drafts(id,project_id,person_id,role_id)
values ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
do $$ begin
  begin
    insert into app_production_management.casting_drafts(project_id,person_id,role_id) values ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
    raise exception 'TEST FAILED duplicate accepted';
  exception when unique_violation then null; end;
  begin
    update app_production_management.casting_drafts set role_id='10000000-0000-4000-8000-000000000002';
    raise exception 'TEST FAILED cross-project role accepted';
  exception when raise_exception then if sqlerrm <> 'Choose a role from this project.' then raise; end if; end;
  begin
    update app_production_management.casting_drafts set coverage_type='swing',covered_role_ids=array['10000000-0000-4000-8000-000000000002'::uuid];
    raise exception 'TEST FAILED cross-project coverage accepted';
  exception when raise_exception then if sqlerrm <> 'Covered roles must belong to this project.' then raise; end if; end;
  begin
    delete from app_production_management.casting_drafts;
    raise exception 'TEST FAILED delete permitted';
  exception when insufficient_privilege then null; end;
end $$;
update app_production_management.casting_drafts set status='withdrawn' where revision=1;
do $$ declare affected integer; begin
  update app_production_management.casting_drafts set actor_notes='stale' where revision=1;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'TEST FAILED stale update permitted'; end if;
end $$;
update app_production_management.casting_drafts set status='draft' where revision=2;
set test.is_manager='false';
do $$ begin
  if exists(select 1 from app_production_management.casting_drafts) then raise exception 'TEST FAILED unauthorized read'; end if;
  begin
    insert into app_production_management.casting_drafts(project_id,person_id,role_id) values ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
    raise exception 'TEST FAILED unauthorized write';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select full_name from app_production_management.people limit 1) <> 'Preserved Actor' then raise exception 'TEST FAILED actor changed'; end if;
  if (select count(*) from app_production_management.casting_drafts) <> 1 then raise exception 'TEST FAILED draft missing'; end if;
  if (select revision from app_production_management.casting_drafts limit 1) <> 3 then raise exception 'TEST FAILED revision wrong'; end if;
end $$;
select 'Casting database assertions passed' as result;
