-- Travel expense: evidence images (Google Maps distance, receipts, ...)
-- Stored as Google Drive thumbnail URLs (compressed client-side, per-user folder).

alter table travel_expense_claims
  add column if not exists attachment_urls text[] not null default '{}';
