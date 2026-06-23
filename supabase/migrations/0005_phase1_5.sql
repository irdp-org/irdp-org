-- =============================================================================
-- IRDP — 0005 : Phase 1.5 (admin/hr cancel of approved leave, employee
-- education field). รันหลัง 0001-0004. ไม่แก้ไฟล์เดิม — เพิ่มเติมเท่านั้น.
--
-- กติกาที่ปรับ:
--  1) ยกเลิกคำขอลาที่ approved แล้วได้ เฉพาะ role admin/hr เท่านั้น (ไม่ใช่
--     dept_head ไม่ใช่เจ้าของ) — เดิม trigger ไม่ได้เช็ค cancel จาก approved เลย
--  2) employees.education — เก็บประวัติการศึกษาแบบหลายระดับ (jsonb array)
-- =============================================================================

-- ---------- 1) enforce_request_rules(): cancel ของ approved = admin/hr เท่านั้น ----------
-- ฟังก์ชันนี้ใช้ร่วมกับ field_requests ด้วย (trg_rules_field) ต้องคง
-- table-agnostic ไว้เหมือนเดิม — เงื่อนไขใหม่เช็คแค่คอลัมน์ status ซึ่งมีทั้ง
-- สองตาราง จึงไม่ต้องใช้ to_jsonb เทียบทั้งแถวแบบ block อื่น
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

  -- NEW (0005): ยกเลิกคำขอที่ approved แล้ว — เฉพาะ admin/hr เท่านั้น
  -- (ไม่ใช่ dept_head แม้จะเป็น is_oversight ก็ไม่ผ่าน RLS อยู่แล้วเพราะ
  -- exec ไม่ใช่ dept_head; แต่ RLS เปิดให้ is_oversight() ทุก role แตะแถวได้
  -- ดังนั้นต้องกันที่ trigger นี้แทน)
  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.status = 'cancelled' and old.status = 'approved' then
    if r not in ('admin','hr') then
      raise exception 'ยกเลิกคำขอที่อนุมัติแล้วได้เฉพาะ admin/hr เท่านั้น';
    end if;
  end if;

  return new;
end $$;
-- trg_rules_leave / trg_rules_field มีอยู่แล้วจาก 0001 ชี้มาที่ฟังก์ชันนี้ —
-- create or replace ด้านบนพอ ไม่ต้องสร้าง trigger ใหม่

-- ---------- 2) employees.education ----------
alter table employees
  add column if not exists education jsonb not null default '[]'::jsonb;
-- โครงสร้างแต่ละ element: {"degree": "...", "institution": "...", "year": "..."}
