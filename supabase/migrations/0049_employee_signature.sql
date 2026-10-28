-- Self-service e-signature (uploaded image or drawn on a signature pad),
-- stored in Google Drive like every other generated/uploaded document in
-- this app rather than Supabase Storage — one current signature per person,
-- replaceable any time.

alter table employees add column if not exists signature_url text;
alter table employees add column if not exists signature_drive_id text;
