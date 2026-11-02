-- publishDar needs to know whether the uploaded source file is a PDF before
-- it can merge a signed certification cover page into it (Word files can't
-- be merged the same way) — record the mime type at upload time.

alter table qms_dar add column if not exists source_mime_type text;
