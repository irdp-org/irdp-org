-- ลงรับเอกสาร needs a 2nd date: "ลงวันที่" (issued_date, already exists —
-- the date we logged/received it) is not the same as the date printed on
-- the incoming document itself (set by whoever sent it). Add that as its
-- own column so both can be tracked; only the ลงรับเอกสาร menu's UI uses it.

alter table document_numbers add column if not exists source_date date;
