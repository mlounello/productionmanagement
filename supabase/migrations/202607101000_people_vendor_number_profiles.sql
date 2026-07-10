alter table app_production_management.people
  add column if not exists vendor_number text not null default '';

create unique index if not exists uq_pm_people_vendor_number_nonblank
on app_production_management.people (lower(btrim(vendor_number)))
where btrim(vendor_number) <> '';

create index if not exists idx_pm_people_vendor_number
on app_production_management.people (vendor_number)
where btrim(vendor_number) <> '';
