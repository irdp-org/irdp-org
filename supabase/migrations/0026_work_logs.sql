-- =============================================================================
-- IRDP — บันทึกเวลาทำงานปกติ (work_logs)
--
-- ผู้บริหารต้องการทราบว่าแต่ละวันพนักงานทำงานกี่โมงถึงกี่โมง ทำอะไรบ้าง
-- แม้ไม่ได้ลา/ไม่ได้ออกนอกสถานที่/ไม่ได้ WFH ก็ตาม ("วันทำงานปกติ")
--
-- โมเดล: self-service เต็มรูปแบบ ไม่ต้องขออนุมัติ บันทึกย้อนหลังได้
-- เจ้าของแก้/ลบของตัวเองได้เสมอ (ไม่มีการล็อกหลังบันทึกแบบ leave/field)
-- หัวหน้าฝ่าย/hr/admin/exec ดูได้ทั้งหมดเพื่อทำรีพอร์ตรวม
-- =============================================================================

create table if not exists work_logs (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  work_date   date not null,
  start_time  time,
  end_time    time,
  tasks       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_worklog_emp on work_logs(employee_id, work_date);

alter table work_logs enable row level security;

drop policy if exists worklog_select on work_logs;
drop policy if exists worklog_insert on work_logs;
drop policy if exists worklog_update on work_logs;
drop policy if exists worklog_delete on work_logs;

create policy worklog_select on work_logs for select to authenticated
  using (employee_id = current_employee_id() or is_oversight()
         or exists (select 1 from employees e where e.id = work_logs.employee_id and is_head_of(e.department_id)));
create policy worklog_insert on work_logs for insert to authenticated
  with check (employee_id = current_employee_id() or is_admin());
create policy worklog_update on work_logs for update to authenticated
  using (employee_id = current_employee_id() or is_admin());
create policy worklog_delete on work_logs for delete to authenticated
  using (employee_id = current_employee_id() or is_admin());

drop trigger if exists trg_worklog_updated_at on work_logs;
create trigger trg_worklog_updated_at
  before update on work_logs
  for each row execute function set_updated_at();
