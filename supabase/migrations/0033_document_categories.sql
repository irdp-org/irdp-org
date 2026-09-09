-- =============================================================================
-- IRDP — เพิ่มหมวดย่อย (แท็บ) และ "ถึง" ให้ระบบออกเลขเอกสาร
--
-- บางฝ่าย (เช่น ธุรการ) แบ่งการออกเลขเป็นหลายส่วนงานย่อย (04.1 บช., 04.2 บค., ...)
-- แต่ละหมวดรันเลขของตัวเอง ทุกคนในฝ่ายเห็นทุกหมวด (แค่แยกเป็นแท็บ)
-- "ถึง" (จ่ายให้ใคร/บริษัทไหน) เป็น smart-search ใช้ร่วมกันทั้งองค์กร
-- =============================================================================

create table if not exists document_categories (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id),
  code          text,
  label         text not null,
  sort_order    int not null default 0,
  created_by    uuid references employees(id),
  created_at    timestamptz not null default now(),
  unique (department_id, label)
);

create table if not exists document_recipients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid references employees(id),
  created_at timestamptz not null default now(),
  unique (name)
);

alter table document_numbers add column if not exists category_id uuid references document_categories(id);
alter table document_numbers add column if not exists recipient text;

alter table document_numbers drop constraint if exists document_numbers_department_id_year_be_seq_key;
alter table document_numbers add constraint document_numbers_dept_cat_year_seq_key unique (department_id, category_id, year_be, seq);

create or replace function fn_next_docnum_seq(p_department_id uuid, p_year int, p_category_id uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select coalesce(max(seq), 0) + 1 into n
  from document_numbers
  where department_id = p_department_id and year_be = p_year
    and category_id is not distinct from p_category_id;
  return n;
end $$;

alter table document_categories enable row level security;
alter table document_recipients enable row level security;

drop policy if exists doccat_select on document_categories;
drop policy if exists doccat_insert on document_categories;
create policy doccat_select on document_categories for select to authenticated
  using (
    is_oversight()
    or exists (select 1 from employees e where e.id = current_employee_id() and e.department_id = document_categories.department_id)
  );
create policy doccat_insert on document_categories for insert to authenticated
  with check (
    is_admin()
    or exists (select 1 from employees e where e.id = current_employee_id() and e.department_id = document_categories.department_id)
  );

drop policy if exists docrecip_select on document_recipients;
drop policy if exists docrecip_insert on document_recipients;
create policy docrecip_select on document_recipients for select to authenticated using (true);
create policy docrecip_insert on document_recipients for insert to authenticated with check (true);

-- Seed the existing ฝ่ายธุรการ sub-categories (from the team's old Google Sheet tabs)
insert into document_categories (department_id, code, label, sort_order)
select d.id, v.code, v.label, v.sort_order
from departments d
cross join (values
  ('04.1', 'บัญชี', 1),
  ('04.2', 'บุคคล', 2),
  ('04.3', 'จัดซื้อ', 3),
  ('04.4', 'ธุรการ', 4),
  ('04.5', 'IT', 5),
  ('04.6', 'เลขา', 6),
  (null, 'Pay Slip', 7)
) as v(code, label, sort_order)
where d.name = 'ธุรการ'
on conflict (department_id, label) do nothing;
