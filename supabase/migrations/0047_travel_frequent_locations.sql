-- Per-employee "smart search" list of จาก/ถึง locations used on travel
-- expense claims, same getOrCreate-on-use pattern as document_recipients
-- (0001_init) — builds up as people type, offered back as a datalist.

create table if not exists travel_frequent_locations (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  label       text not null,
  created_at  timestamptz not null default now(),
  unique (employee_id, label)
);

create index if not exists travel_locations_emp_idx on travel_frequent_locations(employee_id);

alter table travel_frequent_locations enable row level security;

create policy travel_locations_select on travel_frequent_locations for select to authenticated
  using (employee_id = current_employee_id());
create policy travel_locations_insert on travel_frequent_locations for insert to authenticated
  with check (employee_id = current_employee_id());
