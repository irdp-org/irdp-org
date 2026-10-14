-- =============================================================================
-- IRDP — historical registers migrated from the old Excel workbook that don't
-- fit document_numbers' shape: payslip hand-off log ("Pay Slip บค.") and the
-- incoming-document log ("รับเข้า ธก."). Data-only for now — no app page
-- reads these yet; names are kept as plain text (not FK'd to employees)
-- since this is a historical log, not something anyone edits going forward.
-- =============================================================================

create table if not exists document_payslip_log (
  id              uuid primary key default gen_random_uuid(),
  issued_date     date,
  from_dept       text,
  to_person       text,
  title           text,
  issued_by_name  text,
  received_by_name text,
  received_date   date,
  created_at      timestamptz not null default now()
);

create table if not exists document_incoming_log (
  id              uuid primary key default gen_random_uuid(),
  doc_no          text,
  sent_date       date,
  received_date   date,
  from_source     text,
  title           text,
  received_by_name text,
  created_at      timestamptz not null default now()
);

alter table document_payslip_log enable row level security;
alter table document_incoming_log enable row level security;

drop policy if exists payslip_select on document_payslip_log;
create policy payslip_select on document_payslip_log for select to authenticated using (is_oversight());

drop policy if exists incoming_select on document_incoming_log;
create policy incoming_select on document_incoming_log for select to authenticated using (is_oversight());
