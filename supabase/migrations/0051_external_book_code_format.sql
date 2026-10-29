-- เล่มภายนอก categories had code='นอก04.x', which fed straight into
-- "{year}/{code}/{seq}" and produced "2569/นอก04.2/0022" — inconsistent with
-- the imported rows in the same book, which are "IRDP2569/04.2/0022".
-- Strip the "นอก" prefix from the stored code; the app layer now adds the
-- "IRDP" prefix itself for any category under "ภายนอก" (see
-- app/(app)/document-numbers/actions.ts createDocumentNumber).

update document_categories
set code = regexp_replace(code, '^นอก', '')
where label ilike 'ภายนอก%' and code like 'นอก%';
