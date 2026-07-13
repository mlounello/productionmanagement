-- Supabase Storage performs INSERT ... RETURNING for uploads and requires
-- SELECT in addition to INSERT/UPDATE when upsert is enabled.
drop policy if exists "profile headshots select permitted" on storage.objects;
create policy "profile headshots select permitted"
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-headshots'
  and exists (
    select 1
    from app_production_management.people person
    where person.id::text = (storage.foldername(name))[1]
      and (
        person.auth_user_id = auth.uid()
        or app_production_management.has_app_role(array['admin', 'producer', 'staff', 'faculty'])
      )
  )
);
