-- field_requests had no real attachment storage at all — a previous
-- one-off backfill (seed_field_attachment_backfill.sql) had to jam Drive
-- links into the reason text as "(เอกสารแนบ: <url>)" because there was
-- nowhere proper to put them. Add a real column so employees can attach
-- photos/video as evidence of offsite/OT work going forward.
alter table field_requests add column if not exists attachments jsonb not null default '[]'::jsonb;
