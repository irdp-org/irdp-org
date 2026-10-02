-- =============================================================================
-- IRDP — ประวัติการทำงาน/การอบรม บนโปรไฟล์พนักงาน + เช็คอินกิจกรรม/อบรมผ่านปฏิทิน
-- =============================================================================

alter table employees add column if not exists work_history jsonb not null default '[]';
alter table employees add column if not exists training_history jsonb not null default '[]';

-- กิจกรรมในปฏิทิน (type='activity') จะมีสถานที่ได้ และระบุได้ว่าเป็นการจัดอบรม
-- (ถ้าใช่ การเช็คอินจะถูกบันทึกเพิ่มลงประวัติการอบรมของผู้เช็คอินด้วย)
alter table calendar_events add column if not exists location text;
alter table calendar_events add column if not exists is_training boolean not null default false;

create table if not exists activity_checkins (
  id                uuid primary key default gen_random_uuid(),
  calendar_event_id uuid not null references calendar_events(id) on delete cascade,
  employee_id       uuid not null references employees(id),
  location          text,
  checked_in_at     timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  unique (calendar_event_id, employee_id)
);
create index if not exists idx_activity_checkins_event on activity_checkins(calendar_event_id);

alter table activity_checkins enable row level security;

drop policy if exists actcheckin_select on activity_checkins;
drop policy if exists actcheckin_insert on activity_checkins;

create policy actcheckin_select on activity_checkins for select to authenticated
  using (
    employee_id = current_employee_id()
    or is_oversight()
    or exists (
      select 1 from employees e
      where e.id = current_employee_id() and e.role = 'dept_head'
        and e.department_id = (select department_id from employees where id = activity_checkins.employee_id)
    )
  );

create policy actcheckin_insert on activity_checkins for insert to authenticated
  with check (employee_id = current_employee_id());
