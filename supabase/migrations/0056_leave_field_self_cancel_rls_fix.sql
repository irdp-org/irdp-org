-- =============================================================================
-- leave_update / field_update ขาด with check แยกจาก using — Postgres จะเอา
-- using เดิมมาใช้เป็น with check ให้โดยอัตโนมัติ ("status in ('draft','returned',
-- 'submitted')") ซึ่งบล็อกแถวใหม่ที่ status='cancelled' ทันที (ไม่อยู่ใน list
-- นั้น) แม้ enforce_request_rules() (0004/0005) จะตั้งใจอนุญาตให้เจ้าของ
-- ยกเลิกคำขอ submitted ได้เองก็ตาม — ชั้น RLS กับ trigger เลยขัดกันเอง ทำให้
-- พนักงานกด "ยกเลิก" คำขอของตัวเองที่ยัง submitted ไม่ได้เลย (ติด "new row
-- violates row-level security policy" แทน)
--
-- แก้โดยแยก with check ออกมาให้ผ่อนกว่า using: ผ่านแค่ว่าแถวนี้ยังเป็นของ
-- เจ้าของเดิม (หรือ oversight/หัวหน้าฝ่าย) โดยไม่ล็อก status ปลายทาง — ปล่อยให้
-- enforce_request_rules() เป็นคนคุมว่า transition ไหนทำได้บ้างแทน (ซึ่งทำอยู่
-- แล้วอย่างถูกต้อง)
-- =============================================================================

drop policy if exists leave_update on leave_requests;
create policy leave_update on leave_requests for update to authenticated
  using (
     (employee_id = current_employee_id() and status in ('draft','returned','submitted'))
     or is_oversight()
     or exists (select 1 from employees e where e.id = leave_requests.employee_id and is_head_of(e.department_id))
  )
  with check (
     employee_id = current_employee_id()
     or is_oversight()
     or exists (select 1 from employees e where e.id = leave_requests.employee_id and is_head_of(e.department_id))
  );

drop policy if exists field_update on field_requests;
create policy field_update on field_requests for update to authenticated
  using (
     (employee_id = current_employee_id() and status in ('draft','returned','submitted'))
     or is_oversight()
     or exists (select 1 from employees e where e.id = field_requests.employee_id and is_head_of(e.department_id))
  )
  with check (
     employee_id = current_employee_id()
     or is_oversight()
     or exists (select 1 from employees e where e.id = field_requests.employee_id and is_head_of(e.department_id))
  );
