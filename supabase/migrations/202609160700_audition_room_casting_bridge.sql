begin;

alter table app_production_management.audition_submissions
  add column if not exists room_recommendation text not null default '' check(room_recommendation in ('','callback','consider','cast','not_cast','discuss'));
update app_production_management.audition_submissions submission set room_recommendation=coalesce((select review.recommendation from app_production_management.audition_reviews review where review.submission_id=submission.id and review.recommendation<>'' order by review.updated_at desc limit 1),'') where submission.room_recommendation='';
alter table app_production_management.casting_drafts
  add column if not exists source_audition_submission_id uuid references app_production_management.audition_submissions(id) on delete set null;
create unique index if not exists casting_drafts_source_submission
  on app_production_management.casting_drafts(source_audition_submission_id,role_id)
  where source_audition_submission_id is not null;

create or replace function app_production_management.sync_audition_room_casting(
  target_project_id uuid,
  target_submission_id uuid,
  target_recommendation text,
  target_role_ids uuid[] default '{}'
) returns jsonb
language plpgsql security definer
set search_path=app_production_management,pg_temp as $$
declare
  submission audition_submissions;
  draft casting_drafts;
  active_draft casting_drafts;
  selected_role_id uuid;
  next_casting_status text;
begin
  if not coalesce(can_manage_auditions(target_project_id),false) then raise exception 'Audition-room access required.'; end if;
  if target_recommendation not in ('','callback','consider','cast','not_cast','discuss') then raise exception 'Choose a valid next step.'; end if;
  select * into submission from audition_submissions where id=target_submission_id and project_id=target_project_id and cancelled_at is null for update;
  if submission.id is null then raise exception 'Applicant submission not found.'; end if;
  if submission.person_id is null then raise exception 'Link this audition submission to a person before casting them.'; end if;

  if target_recommendation='cast' then
    target_role_ids:=array(select distinct unnest(coalesce(target_role_ids,'{}'::uuid[])));
    if cardinality(target_role_ids)=0 then raise exception 'Select at least one role before marking this applicant Cast.'; end if;
    if exists(select 1 from unnest(target_role_ids) selected where not exists(select 1 from project_roles where id=selected and project_id=target_project_id and role_group='cast')) then raise exception 'Every selected role must be a cast role from this project.'; end if;
    for draft in select * from casting_drafts where source_audition_submission_id=target_submission_id and not(role_id=any(target_role_ids)) for update loop
      if exists(select 1 from casting_offers where draft_id=draft.id and status<>'superseded') then raise exception 'A removed role already has a prepared or answered offer. Update it from Casting & Offers.'; end if;
      update casting_drafts set status='withdrawn' where id=draft.id;
    end loop;
    foreach selected_role_id in array target_role_ids loop
      select * into draft from casting_drafts where source_audition_submission_id=target_submission_id and role_id=selected_role_id for update;
      if draft.id is null then
        select * into active_draft from casting_drafts where project_id=target_project_id and person_id=submission.person_id and role_id=selected_role_id and status='draft' limit 1 for update;
        if active_draft.id is not null then update casting_drafts set source_audition_submission_id=target_submission_id where id=active_draft.id returning * into draft;
        else insert into casting_drafts(project_id,person_id,role_id,source_audition_submission_id,coverage_type,covered_role_ids,additional_duties,actor_notes,status) values(target_project_id,submission.person_id,selected_role_id,target_submission_id,'none','{}','','','draft') returning * into draft;end if;
      elsif draft.status<>'draft' then
        if exists(select 1 from casting_offers where draft_id=draft.id and status<>'superseded') then raise exception 'This role already has a prepared or answered offer. Update it from Casting & Offers.';end if;
        update casting_drafts set status='draft' where id=draft.id;
      end if;
    end loop;
    delete from audition_character_reads where submission_id=target_submission_id and not(project_role_id=any(target_role_ids));
    insert into audition_character_reads(submission_id,project_role_id,marked_by) select target_submission_id,selected,auth.uid() from unnest(target_role_ids) selected on conflict(submission_id,project_role_id) do nothing;
    update audition_submissions set casting_status='cast',room_recommendation=target_recommendation where id=submission.id;
  else
    for draft in select * from casting_drafts where source_audition_submission_id=target_submission_id and status='draft' for update loop
      if exists(select 1 from casting_offers where draft_id=draft.id and status<>'superseded') then raise exception 'This applicant has a prepared or answered offer. Change it from Casting & Offers before removing the Cast decision.'; end if;
      update casting_drafts set status='withdrawn' where id=draft.id;
    end loop;
    next_casting_status:=case target_recommendation when 'not_cast' then 'not_cast' when '' then 'not_reviewed' else 'considering' end;
    update audition_submissions set casting_status=next_casting_status,room_recommendation=target_recommendation where id=submission.id;
  end if;

  insert into audition_reviews(submission_id,reviewer_user_id,recommendation,rubric)
  values(target_submission_id,auth.uid(),target_recommendation,'{}'::jsonb)
  on conflict(submission_id,reviewer_user_id) do update set recommendation=excluded.recommendation,updated_at=now();
  return jsonb_build_object('casting_status',case when target_recommendation='cast' then 'cast' else next_casting_status end,'draft_count',(select count(*) from casting_drafts where source_audition_submission_id=target_submission_id and status='draft'));
end $$;

revoke all on function app_production_management.sync_audition_room_casting(uuid,uuid,text,uuid[]) from public;
grant execute on function app_production_management.sync_audition_room_casting(uuid,uuid,text,uuid[]) to authenticated;
notify pgrst,'reload schema';
commit;
