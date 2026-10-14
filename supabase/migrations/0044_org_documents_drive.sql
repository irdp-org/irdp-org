-- =============================================================================
-- IRDP — org_documents: move from Supabase Storage to Google Drive
--
-- Uploading via a Server Action means the whole file passes through the
-- function's request body; a large PDF (real policy documents routinely run
-- several MB) pushed uploads over the body-size ceiling and failed outright.
-- Google Drive is where the rest of the org's document-generation features
-- already live (contracts, booking docs), so this also keeps storage
-- consistent and gives IT a normal folder to browse/manage directly in Drive.
-- No existing org_documents rows reference storage_path yet, so this is a
-- clean cutover — no backfill needed.
-- =============================================================================

alter table org_documents alter column storage_path drop not null;
alter table org_documents add column if not exists google_file_id text;
alter table org_documents add column if not exists google_view_url text;
