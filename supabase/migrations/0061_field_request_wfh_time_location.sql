-- WFH requests had no time range at all (planned_start/planned_end were
-- only ever populated for offsite/ot) and no way to note where the
-- employee is working from — work_locations is GPS-radius offsite venues
-- (hotels, client sites), not a fit for "home" or wherever WFH happens.
-- Add a plain text field for that instead of forcing it into work_locations.
alter table field_requests add column if not exists location_text text;
