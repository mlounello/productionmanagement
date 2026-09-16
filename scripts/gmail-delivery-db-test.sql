\set ON_ERROR_STOP on
\ir casting-offers-db-test.sql
create role anon;
alter role service_role bypassrls;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),current_user::text) $$;
grant usage on schema auth,app_production_management to service_role;
alter table app_production_management.people add email text;
alter table app_production_management.project_roles add allows_multiple_assignments boolean not null default false;
alter table app_production_management.project_roles add assignment_capacity integer;
update app_production_management.people set email='preserved@example.com';
\ir ../supabase/migrations/202609160400_gmail_delivery_and_notifications.sql

insert into app_production_management.people(id,full_name,email) values('20000000-0000-4000-8000-000000000001','First Offer','first@example.com'),('20000000-0000-4000-8000-000000000002','Second Offer','second@example.com');
insert into app_production_management.project_roles(id,project_id,name,role_group,allows_multiple_assignments,assignment_capacity) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Solo','cast',false,1);
set role authenticated; set test.is_manager='true';
insert into app_production_management.casting_drafts(id,project_id,person_id,role_id) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001');
select app_production_management.prepare_casting_offer('20000000-0000-4000-8000-000000000001',1) first_offer \gset
select app_production_management.prepare_casting_offer('20000000-0000-4000-8000-000000000002',1) second_offer \gset
select app_production_management.reserve_casting_offer_delivery(:'first_offer');
do $$ begin
  begin perform app_production_management.reserve_casting_offer_delivery((select co.id from app_production_management.casting_offers co join app_production_management.casting_drafts cd on cd.id=co.draft_id where cd.person_id='20000000-0000-4000-8000-000000000002')); raise exception 'TEST FAILED over-capacity offer reserved';
  exception when raise_exception then if sqlerrm <> 'This role has no unreserved capacity. Review existing assignments and sent offers.' then raise; end if; end;
  begin perform count(*) from app_production_management.outbound_email_jobs; raise exception 'TEST FAILED protected queue exposed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role service_role;
set request.jwt.claim.role='service_role';
insert into app_production_management.outbound_email_jobs(id,idempotency_key,content_hash,project_id,person_id,to_email,subject,html_body) values('30000000-0000-4000-8000-000000000001','offer-one','hash','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','first@example.com','Offer','<p>Offer</p>');
update app_production_management.casting_offers co set email_job_id='30000000-0000-4000-8000-000000000001' from app_production_management.casting_drafts cd where cd.id=co.draft_id and cd.person_id='20000000-0000-4000-8000-000000000001';
select count(*) claimed from app_production_management.claim_outbound_email_jobs(1,'30000000-0000-4000-8000-000000000001',500) \gset
do $$ begin if (select status from app_production_management.outbound_email_jobs where id='30000000-0000-4000-8000-000000000001')<>'processing' then raise exception 'TEST FAILED job not atomically claimed'; end if; end $$;
update app_production_management.outbound_email_jobs set status='sent',provider_message_id='gmail-receipt',sent_at=now() where id='30000000-0000-4000-8000-000000000001';
reset role;
do $$ begin
  if (select co.delivery_status from app_production_management.casting_offers co join app_production_management.casting_drafts cd on cd.id=co.draft_id where cd.person_id='20000000-0000-4000-8000-000000000001')<>'sent' then raise exception 'TEST FAILED offer delivery not synchronized'; end if;
  if (select co.provider_message_id from app_production_management.casting_offers co join app_production_management.casting_drafts cd on cd.id=co.draft_id where cd.person_id='20000000-0000-4000-8000-000000000001')<>'gmail-receipt' then raise exception 'TEST FAILED Gmail receipt missing'; end if;
  if (select count(*) from app_production_management.role_assignments where person_id='20000000-0000-4000-8000-000000000001')<>0 then raise exception 'TEST FAILED sending created assignment'; end if;
end $$;
select 'Gmail delivery, capacity reservation, and queue assertions passed' result;
