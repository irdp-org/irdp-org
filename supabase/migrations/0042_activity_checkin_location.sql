-- =============================================================================
-- IRDP — activity check-in: onsite (GPS vs. a work_location, like offsite
-- field check-ins already do) vs. online (no GPS needed) instead of free text.
-- =============================================================================

alter table activity_checkins add column if not exists work_location_id uuid references work_locations(id);
alter table activity_checkins add column if not exists lat double precision;
alter table activity_checkins add column if not exists lng double precision;
alter table activity_checkins add column if not exists distance_m double precision;
alter table activity_checkins add column if not exists within_radius boolean;

-- Flag which work_locations row is "the office" — the onsite activity
-- check-in flow always verifies GPS against this one, no picker needed.
alter table work_locations add column if not exists is_hq boolean not null default false;
update work_locations set is_hq = true where name = 'สำนักงาน IRDP (อาคารเอ็กซิม ชั้น 17)';
