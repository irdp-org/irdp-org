-- Self-service check-in model:
-- Employees create offsite/OT/WFH records and check in/out themselves (no
-- pre-approval). Dept heads only verify + approve afterwards. Once approved, the
-- record is locked for everyone except admin.
--
-- Only change needed at the DB layer is tightening the post-approval lock:
-- previously only role='employee' was blocked after approval; now everyone
-- except admin is blocked (dept_head/hr/exec included). Approval transitions
-- themselves are unaffected (old.status <> 'approved' at that point).

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
  -- ล็อกหลังอนุมัติ: แก้ไขได้เฉพาะแอดมินเท่านั้น
  if tg_op = 'UPDATE' and old.status = 'approved' and r <> 'admin' then
     raise exception 'คำขอถูกอนุมัติแล้ว แก้ไขได้เฉพาะแอดมิน';
  end if;
  return new;
end $$;
