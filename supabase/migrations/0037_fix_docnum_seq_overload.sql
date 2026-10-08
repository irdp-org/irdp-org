-- =============================================================================
-- IRDP — แก้บั๊ก "ออกเลขเอกสารไม่ได้": fn_next_docnum_seq มี 2 เวอร์ชันซ้อนกัน
--
-- 0033 ใช้ "create or replace function fn_next_docnum_seq(... , p_category_id
-- uuid default null)" ซึ่งมีพารามิเตอร์มากกว่าเวอร์ชันเดิมใน 0028 — Postgres
-- จึงมองเป็นคนละฟังก์ชัน (overload) แทนที่จะแทนที่ของเดิม ทำให้ตอนนี้มี
-- fn_next_docnum_seq อยู่ 2 เวอร์ชันพร้อมกัน เวลาเรียกแบบกำกวม (เช่นไม่ส่ง
-- p_category_id) PostgREST จะ error "Could not choose the best candidate
-- function" ทำให้ออกเลขไม่สำเร็จ
-- =============================================================================

drop function if exists fn_next_docnum_seq(uuid, int);
