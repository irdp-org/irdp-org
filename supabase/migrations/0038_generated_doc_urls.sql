-- =============================================================================
-- IRDP — เก็บลิงก์เอกสารที่สร้างจากเทมเพลตไว้ที่ตัวรายการ (จอง/เบิก) เอง
-- เพื่อให้กด "ออกเอกสาร" ซ้ำ (เช่นแอดมิน/ผู้อนุมัติ) เปิดเอกสารเดิมที่คนจอง
-- สร้างไว้แล้ว แทนที่จะสร้างสำเนาใหม่ทุกครั้ง
-- =============================================================================

alter table van_bookings add column if not exists generated_doc_url text;
alter table room_bookings add column if not exists generated_doc_url text;
alter table travel_expense_claims add column if not exists generated_doc_url text;
