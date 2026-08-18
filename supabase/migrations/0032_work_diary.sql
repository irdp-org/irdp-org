-- =============================================================================
-- IRDP — สมุดบันทึกกิจกรรมประจำวัน (รวม work_logs + leave + field ในหน้าเดียว)
--
-- - projects: master list โครงการ แบบ smart-search — ใครพิมพ์ชื่อใหม่ก็สร้างได้
--   เอง คนถัดไปจะเห็นเป็นตัวเลือกอัตโนมัติ (กันสะกดซ้ำ/แยกกลุ่ม)
-- - work_logs: เพิ่ม project_id + ไฟล์แนบ (Google Drive)
-- - วันหยุดขององค์กรใช้ calendar_events (type='holiday') ที่มีอยู่แล้ว ไม่ต้องสร้าง
--   ตารางใหม่ — admin/hr กำหนดผ่านหน้า /calendar เดิม
-- - day_acknowledgements: หัวหน้าฝ่าย "รับทราบ" + คอมเมนต์ได้ทีละวัน ต่อพนักงาน
--   1 คน — อัปเดตซ้ำได้ (ไม่ล็อกหลังรับทราบ) แจ้งเตือนพนักงานทุกครั้งที่มีคอมเมนต์ใหม่
-- =============================================================================

create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references employees(id),
  created_at  timestamptz not null default now(),
  unique (name)
);

alter table work_logs add column if not exists project_id uuid references projects(id);
alter table work_logs add column if not exists attachment_url text;
alter table work_logs add column if not exists attachment_drive_id text;

create table if not exists day_acknowledgements (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references employees(id),
  log_date         date not null,
  comment          text,
  acknowledged_by  uuid not null references employees(id),
  acknowledged_at  timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (employee_id, log_date)
);

-- ── projects ─────────────────────────────────────────────────────────────────
alter table projects enable row level security;
drop policy if exists projects_select on projects;
drop policy if exists projects_insert on projects;
create policy projects_select on projects for select to authenticated using (true);
create policy projects_insert on projects for insert to authenticated
  with check (created_by = current_employee_id());

-- ── day_acknowledgements: self reads own; dept_head/oversight read+write for
-- their scope ─────────────────────────────────────────────────────────────────
alter table day_acknowledgements enable row level security;
drop policy if exists dayack_select on day_acknowledgements;
drop policy if exists dayack_insert on day_acknowledgements;
drop policy if exists dayack_update on day_acknowledgements;
create policy dayack_select on day_acknowledgements for select to authenticated
  using (
    employee_id = current_employee_id()
    or is_oversight()
    or exists (select 1 from employees e where e.id = day_acknowledgements.employee_id and is_head_of(e.department_id))
  );
create policy dayack_insert on day_acknowledgements for insert to authenticated
  with check (
    acknowledged_by = current_employee_id()
    and (
      is_oversight()
      or exists (select 1 from employees e where e.id = day_acknowledgements.employee_id and is_head_of(e.department_id))
    )
  );
create policy dayack_update on day_acknowledgements for update to authenticated
  using (
    is_oversight()
    or exists (select 1 from employees e where e.id = day_acknowledgements.employee_id and is_head_of(e.department_id))
  );
