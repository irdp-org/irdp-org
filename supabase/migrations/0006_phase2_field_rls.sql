-- =============================================================================
-- IRDP — 0006 : Phase 2 RLS adjustment (field_requests self-cancel). รันหลัง
-- 0001-0005. ไม่แก้ไฟล์เดิม — เพิ่มเติมเท่านั้น.
--
-- กติกาที่ปรับ:
--  1) เจ้าของยกเลิกคำขอนอกสถานที่/OT/WFH ที่ submitted (ยังไม่ approved) ได้เอง
--     เหมือนที่ leave_update แก้ไปแล้วใน 0004 — field_update เดิมยังมี gap นี้
--     อยู่ (แก้ได้แค่ตอน draft/returned) เพราะตอนแก้ 0004 แก้แค่ leave_update
--     ไม่ได้แตะ field_update ด้วย
--
--  enforce_request_rules() ไม่ต้องแก้ซ้ำ — ฟังก์ชันนี้เขียนแบบ table-agnostic
--  มาตั้งแต่ 0004/0005 (ใช้ to_jsonb diff + เช็คแค่คอลัมน์ status) เพื่อให้ครอบคลุม
--  ทั้ง leave_requests และ field_requests โดยอัตโนมัติอยู่แล้ว
-- =============================================================================

drop policy if exists field_update on field_requests;
create policy field_update on field_requests for update to authenticated
  using (
     (employee_id = current_employee_id() and status in ('draft','returned','submitted'))
     or is_oversight()
     or exists (select 1 from employees e where e.id = field_requests.employee_id and is_head_of(e.department_id))
  );
