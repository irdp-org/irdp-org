-- "เส้นทางที่ใช้บ่อย" — a named, reusable bundle of travel_expense_items
-- rows (e.g. ขาไป + ค่าทางด่วนขาไป + ขากลับ + ค่าทางด่วนขากลับ) that a
-- round-trip can be re-added from in one click instead of retyping every
-- leg + toll fee each time the same route gets claimed again.

create table if not exists travel_trip_templates (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  label       text not null,
  created_at  timestamptz not null default now()
);

create table if not exists travel_trip_template_items (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references travel_trip_templates(id) on delete cascade,
  from_location text,
  to_location   text,
  mode          text not null,
  km            numeric,
  amount        numeric not null default 0,
  note          text,
  sort_order    int not null default 0
);

create index if not exists travel_trip_templates_emp_idx on travel_trip_templates(employee_id);
create index if not exists travel_trip_template_items_tpl_idx on travel_trip_template_items(template_id);

alter table travel_trip_templates enable row level security;
alter table travel_trip_template_items enable row level security;

create policy travel_trip_templates_all on travel_trip_templates for all to authenticated
  using (employee_id = current_employee_id())
  with check (employee_id = current_employee_id());

create policy travel_trip_template_items_all on travel_trip_template_items for all to authenticated
  using (exists (select 1 from travel_trip_templates t where t.id = template_id and t.employee_id = current_employee_id()))
  with check (exists (select 1 from travel_trip_templates t where t.id = template_id and t.employee_id = current_employee_id()));
