-- =============================================================================
-- IRDP — document_numbers: add from_name / ref_no for incoming-document rows
--
-- document_numbers was designed for OUTGOING numbering (issued_by + "ถึง"
-- recipient). The incoming-document imports (ส่วนรับเลขา, รับเข้า ธุรการ)
-- had no "จาก" (sender) field to put real data in, so it got stuffed into
-- recipient (wrong — that's "ถึง") or prefixed onto the title as a hack.
-- Add proper columns instead of continuing to misuse existing ones.
-- =============================================================================

alter table document_numbers add column if not exists from_name text;
alter table document_numbers add column if not exists ref_no text;
