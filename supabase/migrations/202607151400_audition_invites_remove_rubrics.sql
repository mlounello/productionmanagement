begin;

update app_production_management.audition_forms set settings=settings-'packet_rubric' where settings ? 'packet_rubric';
update app_production_management.audition_reviews set rubric='{}'::jsonb where rubric<>'{}'::jsonb;

alter table app_production_management.profile_access_links
  add column if not exists destination_path text not null default '/my-profile';

create table if not exists app_production_management.audition_access_invites(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects(id) on delete cascade,
  person_id uuid not null references app_production_management.people(id) on delete cascade,
  reviewer_role text not null check(reviewer_role in('director','production_manager','intimacy_staff')),
  invited_by uuid references auth.users(id) on delete set null,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,person_id,reviewer_role)
);

alter table app_production_management.audition_access_invites enable row level security;
grant select,insert,update,delete on app_production_management.audition_access_invites to authenticated;
grant select,insert,update,delete on app_production_management.audition_access_invites to service_role;

create policy "project managers manage audition invitations" on app_production_management.audition_access_invites
for all to authenticated
using(app_production_management.has_project_role(project_id,array['project_manager','producer']) or app_production_management.has_app_role(array['admin','producer']))
with check(app_production_management.has_project_role(project_id,array['project_manager','producer']) or app_production_management.has_app_role(array['admin','producer']));

create or replace function app_production_management.claim_pending_audition_access()
returns integer language plpgsql security definer set search_path=app_production_management,public as $$
declare invite audition_access_invites;profile people;claimed integer:=0;membership_role text;
begin
  if auth.uid() is null then raise exception 'Authentication required.';end if;
  select * into profile from people where auth_user_id=auth.uid() limit 1;
  if profile.id is null then return 0;end if;
  for invite in select * from audition_access_invites where person_id=profile.id and claimed_at is null for update loop
    membership_role:=case when invite.reviewer_role='production_manager' then 'project_manager' else 'staff' end;
    insert into project_memberships(project_id,user_id,person_id,role,title,active)
    values(invite.project_id,auth.uid(),profile.id,membership_role,replace(invite.reviewer_role,'_',' '),true)
    on conflict(project_id,user_id,role) do update set person_id=excluded.person_id,title=excluded.title,active=true;
    insert into audition_reviewer_permissions(project_id,user_id,reviewer_role,active)
    values(invite.project_id,auth.uid(),invite.reviewer_role,true)
    on conflict(project_id,user_id,reviewer_role) do update set active=true;
    update audition_access_invites set claimed_by=auth.uid(),claimed_at=now(),updated_at=now() where id=invite.id;
    claimed:=claimed+1;
  end loop;
  return claimed;
end;$$;

grant execute on function app_production_management.claim_pending_audition_access() to authenticated;

commit;
