begin;

-- Poster uploads use the server integration credential so a successful storage
-- upload can be recorded without depending on the browser's RLS session. Keep
-- that elevated write limited to the poster field.
grant update (poster_image_url)
  on app_production_management.projects
  to service_role;

commit;
