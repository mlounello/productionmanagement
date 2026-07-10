insert into app_production_management.reference_values (reference_type, label, slug, sort_order, is_active)
values
  ('role_group', 'Creative Team', 'creative_team', 10, true),
  ('role_group', 'Production Team', 'production_team', 20, true),
  ('role_group', 'Cast', 'cast', 30, true),
  ('role_group', 'Directorial Team', 'directorial_team', 40, true),
  ('role_group', 'Administrative', 'administrative', 50, true),
  ('role_group', 'Front of House', 'front_of_house', 60, true),
  ('role_group', 'Music / Band', 'music_band', 70, true)
on conflict (reference_type, slug) do update
set label = excluded.label,
    sort_order = excluded.sort_order,
    is_active = true,
    updated_at = now();

update app_production_management.reference_values
set is_active = false,
    updated_at = now()
where reference_type = 'role_group'
  and slug in ('crew', 'designer', 'department_head', 'staff', 'guest_artist');
