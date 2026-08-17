-- =============================================================================
-- IRDP — ระบบออกเลขเอกสาร (document_numbers)
--
-- แต่ละฝ่ายออกเลขเอกสารของตัวเอง เห็นเฉพาะของฝ่ายตัวเอง (admin/hr เห็นทุกฝ่าย)
-- รูปแบบเลขที่: <ชื่อฝ่าย>/<ปี พ.ศ.>/<running number 3 หลัก> เช่น ธุรการ/2569/001
-- คนออกเลข: พิมพ์ชื่อเรื่อง ระบบรันเลข+วันที่ให้อัตโนมัติ, บันทึกผู้ออกเลข
-- คนในฝ่ายแก้ชื่อเรื่อง/วันที่/แนบไฟล์ให้ภายหลังได้ (ไม่ใช่แค่ผู้ออกเลข)
-- =============================================================================

create table if not exists document_numbers (
  id                uuid primary key default gen_random_uuid(),
  department_id     uuid not null references departments(id),
  year_be           int not null,
  seq               int not null,
  doc_no            text not null,
  title             text not null,
  issued_date       date not null default current_date,
  issued_by         uuid not null references employees(id),
  attachment_drive_id text,
  attachment_url    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (department_id, year_be, seq)
);
create index if not exists idx_docnum_dept on document_numbers(department_id, year_be, seq);

create or replace function fn_next_docnum_seq(p_department_id uuid, p_year int) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select coalesce(max(seq), 0) + 1 into n
  from document_numbers
  where department_id = p_department_id and year_be = p_year;
  return n;
end $$;

alter table document_numbers enable row level security;

drop policy if exists docnum_select on document_numbers;
drop policy if exists docnum_insert on document_numbers;
drop policy if exists docnum_update on document_numbers;
drop policy if exists docnum_delete on document_numbers;

-- Visible to: anyone in the issuing department, plus oversight (hr/admin/exec)
create policy docnum_select on document_numbers for select to authenticated
  using (
    is_oversight()
    or exists (select 1 from employees e where e.id = current_employee_id() and e.department_id = document_numbers.department_id)
  );

-- Issue a new number: only within your own department (or admin on behalf of any dept)
create policy docnum_insert on document_numbers for insert to authenticated
  with check (
    issued_by = current_employee_id()
    and (
      is_admin()
      or exists (select 1 from employees e where e.id = current_employee_id() and e.department_id = document_numbers.department_id)
    )
  );

-- Edit title/date/attachment: anyone in the same department, or admin
create policy docnum_update on document_numbers for update to authenticated
  using (
    is_admin()
    or exists (select 1 from employees e where e.id = current_employee_id() and e.department_id = document_numbers.department_id)
  );

create policy docnum_delete on document_numbers for delete to authenticated
  using (is_admin());

drop trigger if exists trg_docnum_updated_at on document_numbers;
create trigger trg_docnum_updated_at
  before update on document_numbers
  for each row execute function set_updated_at();
