begin;

create table app_production_management.outbound_email_jobs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  content_hash text not null,
  project_id uuid references app_production_management.projects(id) on delete set null,
  person_id uuid references app_production_management.people(id) on delete set null,
  to_email text not null,
  subject text not null,
  html_body text not null,
  status text not null default 'queued' check(status in ('queued','processing','sent','failed','uncertain','cancelled')),
  attempts integer not null default 0 check(attempts between 0 and 12),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  provider text not null default 'gmail' check(provider='gmail'),
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  check(length(trim(to_email))>3 and position('@' in to_email)>1),
  check(length(subject) between 1 and 500),
  check(octet_length(html_body)<=1000000)
);
create index outbound_email_jobs_ready on app_production_management.outbound_email_jobs(next_attempt_at,created_at) where status='queued';
alter table app_production_management.outbound_email_jobs enable row level security;
revoke all on app_production_management.outbound_email_jobs from public,anon,authenticated;
grant select,insert,update on app_production_management.outbound_email_jobs to service_role;

create or replace function app_production_management.claim_outbound_email_jobs(
  batch_limit integer default 10,
  target_job uuid default null,
  daily_limit integer default 500
) returns setof app_production_management.outbound_email_jobs
language plpgsql security definer set search_path=app_production_management,pg_temp as $$
declare remaining integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.'; end if;
  remaining := greatest(0,least(batch_limit,daily_limit-(select count(*)::integer from outbound_email_jobs where status='sent' and sent_at>now()-interval '24 hours')));
  if remaining=0 then return; end if;
  return query
    with candidates as (
      select id from outbound_email_jobs
      where status='queued' and next_attempt_at<=now() and attempts<6 and (target_job is null or id=target_job)
      order by created_at,id for update skip locked limit remaining
    )
    update outbound_email_jobs j set status='processing',attempts=j.attempts+1,locked_at=now(),updated_at=now()
    from candidates c where j.id=c.id returning j.*;
end $$;
revoke all on function app_production_management.claim_outbound_email_jobs(integer,uuid,integer) from public;
grant execute on function app_production_management.claim_outbound_email_jobs(integer,uuid,integer) to service_role;

create table app_production_management.project_notifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app_production_management.projects(id) on delete cascade,
  person_id uuid references app_production_management.people(id) on delete set null,
  offer_id uuid references app_production_management.casting_offers(id) on delete set null,
  event_type text not null,
  title text not null,
  message text not null,
  action_path text not null,
  dedupe_key text not null unique,
  status text not null default 'unread' check(status in ('unread','read','resolved')),
  email_status text not null default 'not_queued' check(email_status in ('not_queued','queued','processing','sent','failed','uncertain','cancelled')),
  email_job_id uuid references app_production_management.outbound_email_jobs(id) on delete set null,
  email_error text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  read_by uuid references auth.users(id) on delete set null
);
create index project_notifications_open on app_production_management.project_notifications(project_id,created_at desc) where status='unread';
alter table app_production_management.project_notifications enable row level security;
create policy "managers read project notifications" on app_production_management.project_notifications for select to authenticated
using(app_production_management.has_app_role(array['admin','producer']) or app_production_management.has_project_role(project_id,array['project_manager','producer']));
grant select on app_production_management.project_notifications to authenticated,service_role;
grant insert,update on app_production_management.project_notifications to service_role;

create table app_production_management.project_notification_recipients (
  project_id uuid not null references app_production_management.projects(id) on delete cascade,
  email text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(project_id,email)
);
alter table app_production_management.project_notification_recipients enable row level security;
create policy "managers read notification recipients" on app_production_management.project_notification_recipients for select to authenticated
using(app_production_management.has_app_role(array['admin','producer']) or app_production_management.has_project_role(project_id,array['project_manager','producer']));
grant select on app_production_management.project_notification_recipients to authenticated,service_role;
grant insert,update,delete on app_production_management.project_notification_recipients to service_role;

create table app_production_management.project_notification_deliveries (
  notification_id uuid not null references app_production_management.project_notifications(id) on delete cascade,
  email text not null,
  email_job_id uuid not null references app_production_management.outbound_email_jobs(id) on delete restrict,
  status text not null default 'queued' check(status in ('queued','processing','sent','failed','uncertain','cancelled')),
  error_message text,
  primary key(notification_id,email)
);
alter table app_production_management.project_notification_deliveries enable row level security;
create policy "managers read notification deliveries" on app_production_management.project_notification_deliveries for select to authenticated
using(exists(select 1 from app_production_management.project_notifications n where n.id=notification_id and (app_production_management.has_app_role(array['admin','producer']) or app_production_management.has_project_role(n.project_id,array['project_manager','producer']))));
grant select on app_production_management.project_notification_deliveries to authenticated,service_role;
grant insert,update on app_production_management.project_notification_deliveries to service_role;

alter table app_production_management.casting_offers
  add column email_job_id uuid references app_production_management.outbound_email_jobs(id) on delete set null,
  add column delivery_status text not null default 'not_sent' check(delivery_status in ('not_sent','queued','processing','sent','failed','uncertain','cancelled')),
  add column delivery_error text not null default '',
  add column sent_at timestamptz,
  add column provider_message_id text;
grant update(email_job_id,delivery_status,delivery_error,sent_at,provider_message_id) on app_production_management.casting_offers to service_role;

create or replace function app_production_management.reserve_casting_offer_delivery(target_offer uuid)
returns jsonb language plpgsql security definer set search_path=app_production_management,pg_temp as $$
declare o casting_offers; d casting_drafts; r project_roles; address text; capacity integer; occupied integer; reserved integer;
begin
  select * into o from casting_offers where id=target_offer for update;
  if o.id is null or not coalesce(has_app_role(array['admin','producer']) or has_project_role(o.project_id,array['project_manager','producer']),false) then raise exception 'Casting manager access required.'; end if;
  if o.status <> 'prepared' or o.expires_at<=now() then raise exception 'Only a current, unanswered offer can be sent.'; end if;
  if o.delivery_status <> 'not_sent' then return jsonb_build_object('already_reserved',true); end if;
  select * into d from casting_drafts where id=o.draft_id;
  if d.status<>'draft' or d.revision<>o.draft_revision then raise exception 'This offer is no longer current.'; end if;
  select * into r from project_roles where id=d.role_id for update;
  select lower(trim(email)) into address from people where id=d.person_id;
  if coalesce(address,'')='' or position('@' in address)<2 then raise exception 'This actor needs a valid email address before sending.'; end if;
  capacity := case when r.allows_multiple_assignments then r.assignment_capacity else 1 end;
  if capacity is not null then
    select count(*) into occupied from role_assignments where role_id=d.role_id and status not in ('declined','withdrawn');
    select count(*) into reserved from casting_offers co join casting_drafts cd on cd.id=co.draft_id
      where cd.role_id=d.role_id and co.id<>o.id and co.status<>'superseded' and co.released_at is null and co.delivery_status<>'not_sent' and co.delivery_status<>'cancelled';
    if occupied+reserved>=capacity then raise exception 'This role has no unreserved capacity. Review existing assignments and sent offers.'; end if;
  end if;
  update casting_offers set delivery_status='queued',delivery_error='' where id=o.id;
  return jsonb_build_object('already_reserved',false,'email',address);
end $$;
revoke all on function app_production_management.reserve_casting_offer_delivery(uuid) from public;
grant execute on function app_production_management.reserve_casting_offer_delivery(uuid) to authenticated;

create or replace function app_production_management.sync_outbound_email_job() returns trigger
language plpgsql security definer set search_path=app_production_management,pg_temp as $$
begin
  update casting_offers set delivery_status=new.status,delivery_error=coalesce(new.last_error,''),sent_at=new.sent_at,provider_message_id=new.provider_message_id where email_job_id=new.id;
  update project_notifications set email_status=new.status,email_error=new.last_error where email_job_id=new.id;
  update project_notification_deliveries set status=new.status,error_message=new.last_error where email_job_id=new.id;
  update project_notifications n set
    email_status=case
      when exists(select 1 from project_notification_deliveries d where d.notification_id=n.id and d.status='uncertain') then 'uncertain'
      when exists(select 1 from project_notification_deliveries d where d.notification_id=n.id and d.status='failed') then 'failed'
      when exists(select 1 from project_notification_deliveries d where d.notification_id=n.id and d.status in ('queued','processing')) then 'queued'
      when exists(select 1 from project_notification_deliveries d where d.notification_id=n.id) then 'sent'
      else n.email_status end,
    email_error=(select string_agg(coalesce(d.error_message,''),' ') from project_notification_deliveries d where d.notification_id=n.id and d.status in ('failed','uncertain'))
  where exists(select 1 from project_notification_deliveries d where d.notification_id=n.id and d.email_job_id=new.id);
  return new;
end $$;
create trigger sync_outbound_email_job after update of status on app_production_management.outbound_email_jobs
for each row execute function app_production_management.sync_outbound_email_job();

commit;
