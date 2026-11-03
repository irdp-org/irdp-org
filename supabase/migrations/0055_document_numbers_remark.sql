-- ฝ่ายประเมินผล's register needs a "หมายเหตุ" (remark) field that the other
-- departments' ออกเลขเอกสาร registers don't use — add it as a plain nullable
-- column (available to every department at the DB level; the UI only shows
-- it for ฝ่ายประเมินผล and for oversight roles, see DocumentNumbersClient).

alter table document_numbers add column if not exists remark text;
