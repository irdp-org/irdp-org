-- =============================================================================
-- IRDP — 0004 : Phase 1 RLS adjustments (leave self-cancel, calendar dept-head
-- visibility). รันหลัง 0001-0003. ไม่แก้ไฟล์เดิม — เพิ่มเติมเท่านั้น.
--
-- กติกาที่ปรับ:
--  1) เจ้าของยกเลิกคำขอที่ submitted (ยังไม่ approved) ได้เอง ไม่ต้องรอหัวหน้าฝ่าย
--     (เดิม RLS ให้แก้ได้แค่ตอน draft/returned) — แก้ได้แค่ "ยกเลิก" เท่านั้น
--     ห้ามแก้รายละเอียดอื่นระหว่างทาง (ล็อกที่ enforce_request_rules() เพื่อกัน
--     ไม่ให้พนักงานแอบเปลี่ยนวันที่/ชั่วโมงทั้งที่ยื่นไปแล้ว)
--  2) หัวหน้าฝ่ายเห็นวันลา (calendar_events scope='personal') ของคนในฝ่ายตัวเอง
--     ในปฏิทินได้ (เดิม RLS ให้เห็นเฉพาะเจ้าของเอง)
-- =============================================================================

-- ---------- 1) leave_update: เพิ่ม 'submitted' ในสถานะที่เจ้าของแก้ได้ ----------
drop policy if exists leave_update on leave_requests;
create policy leave_update on leave_requests for update to authenticated
  using (
     (employee_id = current_employee_id() and status in ('draft','returned','submitted'))
     or is_oversight()
     or exists (select 1 from employees e where e.id = leave_requests.employee_id and is_head_of(e.department_id))
  );

-- ---------- 2) enforce_request_rules(): ล็อกการ "ยกเลิกเอง" ให้แก้ได้แค่ status ----------
-- ฟังก์ชันนี้ใช้ร่วมกับ field_requests ด้วย (trg_rules_field) จึงต้องเขียนแบบ
-- table-agnostic — ใช้ to_jsonb(old/new) เทียบทั้งแถวแทนการอ้างชื่อคอลัมน์ตรงๆ
-- ของ leave_requests (ซึ่ง field_requests ไม่มีคอลัมน์ชุดเดียวกัน)
create or replace function enforce_request_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare r role_t := current_role_t();
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.status in ('approved','rejected','returned') then
     if r = 'hr' then raise exception 'HR ไม่มีสิทธิ์อนุมัติ/ตีกลับ (แก้เวลาได้เท่านั้น)'; end if;
     if r not in ('dept_head','admin','exec') then
       raise exception 'เฉพาะหัวหน้าฝ่าย/แอดมิน/ผู้บริหารเท่านั้นที่เปลี่ยนสถานะอนุมัติได้';
     end if;
     new.approver_id := coalesce(new.approver_id, current_employee_id());
     new.decided_at  := now();
  end if;

  -- ล็อกหลังอนุมัติ: เจ้าของ (role employee) แก้ไม่ได้
  if tg_op = 'UPDATE' and old.status = 'approved'
     and r = 'employee' and old.employee_id = current_employee_id() then
     raise exception 'คำขอถูกอนุมัติแล้ว พนักงานแก้ไขไม่ได้';
  end if;

  -- เจ้าของยกเลิกคำขอที่ submitted ได้เอง — เปลี่ยนได้แค่ status -> cancelled
  -- เท่านั้น คอลัมน์อื่นต้องเหมือนเดิมทั้งหมด (กันแอบแก้รายละเอียดระหว่างยกเลิก)
  if tg_op = 'UPDATE' and old.status = 'submitted'
     and r = 'employee' and old.employee_id = current_employee_id() then
    if new.status is distinct from 'cancelled' then
      raise exception 'พนักงานยกเลิกคำขอที่ยื่นแล้วได้เท่านั้น (เปลี่ยนเป็นสถานะอื่นไม่ได้)';
    end if;
    if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
      raise exception 'แก้ไขรายละเอียดคำขอที่ยื่นแล้วไม่ได้ ยกเลิกได้อย่างเดียว';
    end if;
  end if;

  return new;
end $$;
-- trg_rules_leave / trg_rules_field มีอยู่แล้วจาก 0001 ชี้มาที่ฟังก์ชันนี้ —
-- create or replace ด้านบนพอ ไม่ต้องสร้าง trigger ใหม่

-- ---------- 3) cal_select: หัวหน้าฝ่ายเห็น personal-scope event ของคนในฝ่าย ----------
drop policy if exists cal_select on calendar_events;
create policy cal_select on calendar_events for select to authenticated using (
     scope = 'org'
  or is_oversight()
  or (scope = 'dept' and department_id = current_dept())
  or (scope = 'personal' and owner_id = current_employee_id())
  or (scope = 'personal' and exists (
        select 1 from employees e where e.id = calendar_events.owner_id and is_head_of(e.department_id)
      ))
);
