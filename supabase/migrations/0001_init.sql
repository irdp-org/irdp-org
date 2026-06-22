-- =============================================================================
-- IRDP Internal System — Phase 0 : Schema + RLS + Helpers + Seed
-- Target: fresh Supabase Postgres project (PG15+)
-- Decisions locked:
--   • พักร้อน: ปีปฏิทินที่ 1-3 = 10, 4-5 = 12, 6 ขึ้นไป = 15 (ปีแรกก่อน ก.ค.=7 / หลัง=0)
--   • OT: นับเฉพาะเวลาหลัง 17:00 ของวันทำงาน (ก่อน 08:30 ไม่นับ) + วันหยุดตามระเบียบ
--   • ปฏิทิน: Google Calendar two-way sync (เก็บ google_event_id + etag + last_synced_at)
-- หน่วยลา: ชั่วโมง, เต็มวัน = 7.5 ชม.
-- รันครั้งเดียวบน DB ว่าง. แนะนำรันผ่าน Supabase migration / SQL editor (ไม่ใช่ MCP บน prod)
-- =============================================================================

create extension if not exists pgcrypto;     -- gen_random_uuid()
create extension if not exists btree_gist;    -- EXCLUDE constraint กันจองชนเวลา

-- =============================================================================
-- 1) ENUMS
-- =============================================================================
do $$ begin
  create type role_t            as enum ('employee','dept_head','hr','admin','exec');
  create type employee_status_t as enum ('active','inactive','pending');
  create type leave_code_t      as enum ('sick','personal','vacation');
  create type request_status_t  as enum ('draft','submitted','approved','rejected','returned','cancelled');
  create type attendance_type_t as enum ('offsite','ot','wfh');
  create type checkin_kind_t    as enum ('in','out','wfh_morning','wfh_evening');
  create type ot_type_t         as enum ('weekday_ot','holiday_normal','holiday_ot');
  create type approval_action_t as enum ('approve','reject','return','cancel','acknowledge');
  create type asset_status_t    as enum ('in_stock','assigned','returned','broken','disposed');
  create type assign_status_t   as enum ('pending_accept','accepted','returned');
  create type booking_status_t  as enum ('booked','cancelled');
  create type cal_type_t        as enum ('holiday','meeting','merit','activity','leave','booking');
  create type cal_scope_t       as enum ('org','dept','personal');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- 2) CORE TABLES
-- =============================================================================
create table if not exists departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists employees (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users(id) on delete set null,  -- ผูกตอนล็อกอินครั้งแรก
  email         text not null unique,
  full_name     text not null,
  department_id uuid references departments(id),
  role          role_t not null default 'employee',
  position      text,
  phone         text,
  birthdate     date,
  hire_date     date,                 -- HR กรอก เพื่อคำนวณโควต้าพักร้อน
  address       text,
  avatar_url    text,
  status        employee_status_t not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_employees_dept on employees(department_id);
create index if not exists idx_employees_role on employees(role);

-- attachments (ใช้ร่วม: ใบรับรองแพทย์, เอกสารทรัพย์สิน, รูปแนบทั่วไป)
create table if not exists attachments (
  id           uuid primary key default gen_random_uuid(),
  bucket       text not null,
  path         text not null,
  filename     text,
  content_type text,
  uploaded_by  uuid references employees(id),
  entity       text,                  -- ชื่อตารางที่อ้างถึง
  entity_id    uuid,
  created_at   timestamptz not null default now()
);

-- approvals / acknowledge timeline (ใช้ร่วมทุกโมดูล)
create table if not exists approvals (
  id          uuid primary key default gen_random_uuid(),
  entity      text not null,          -- 'leave_requests' | 'field_requests' | ...
  entity_id   uuid not null,
  actor_id    uuid not null references employees(id),
  action      approval_action_t not null,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_approvals_entity on approvals(entity, entity_id);

-- audit log (before/after ทุกการเปลี่ยนแปลง)
create table if not exists audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null,          -- INSERT|UPDATE|DELETE
  entity      text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_entity on audit_logs(entity, entity_id);

-- notifications (in-app center)
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references employees(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notif_user on notifications(user_id, read_at);

create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references employees(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

-- =============================================================================
-- 3) HELPER FUNCTIONS (SECURITY DEFINER เพื่อกัน recursive RLS)
-- =============================================================================
create or replace function current_employee_id() returns uuid
  language sql stable security definer set search_path = public as
$$ select id from employees where user_id = auth.uid() $$;

create or replace function current_role_t() returns role_t
  language sql stable security definer set search_path = public as
$$ select role from employees where user_id = auth.uid() $$;

create or replace function current_dept() returns uuid
  language sql stable security definer set search_path = public as
$$ select department_id from employees where user_id = auth.uid() $$;

create or replace function is_admin()     returns boolean language sql stable as $$ select current_role_t() = 'admin' $$;
create or replace function is_dept_head() returns boolean language sql stable as $$ select current_role_t() = 'dept_head' $$;
create or replace function is_hr()        returns boolean language sql stable as $$ select current_role_t() = 'hr' $$;
create or replace function is_exec()      returns boolean language sql stable as $$ select current_role_t() = 'exec' $$;
-- hr/admin/exec = เห็นทุกฝ่าย
create or replace function is_oversight() returns boolean language sql stable as $$ select current_role_t() in ('hr','admin','exec') $$;
-- hr/admin = แก้วัน-เวลาได้ (hr อนุมัติไม่ได้ แต่แก้ได้)
create or replace function can_edit()     returns boolean language sql stable as $$ select current_role_t() in ('hr','admin') $$;
create or replace function is_head_of(d uuid) returns boolean language sql stable as $$ select is_dept_head() and current_dept() = d $$;

-- โควต้าพักร้อน (วัน) ตามอายุงาน + ปีปฏิทินเป้าหมาย
create or replace function fn_vacation_days(p_hire date, p_year int) returns int
language plpgsql immutable as $$
declare hy int; hm int; idx int;
begin
  if p_hire is null then return 0; end if;
  hy := extract(year from p_hire);  hm := extract(month from p_hire);
  if p_year = hy then
    return case when hm <= 6 then 7 else 0 end;   -- ปีแรก: ก่อน ก.ค.=7 / หลัง=0 (ไม่ทบ)
  end if;
  idx := p_year - hy;                              -- ปีถัดจากปีเริ่มงาน = ปีปฏิทินที่ 1
  if idx <= 0 then return 0;
  elsif idx between 1 and 3 then return 10;
  elsif idx between 4 and 5 then return 12;        -- ปีที่ 5 = 12 (ยืนยันแล้ว)
  else return 15;                                  -- ปีที่ 6 ขึ้นไป = 15
  end if;
end $$;

-- =============================================================================
-- 4) LEAVE MODULE
-- =============================================================================
create table if not exists leave_types (
  code               leave_code_t primary key,
  name_th            text not null,
  default_annual_days numeric,        -- sick=30, personal=10 ; vacation=NULL (คำนวณตามอายุงาน)
  accrues_by_tenure  boolean not null default false,
  carry_over         boolean not null default false
);

create table if not exists leave_balances (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references employees(id) on delete cascade,
  year          int  not null,
  leave_code    leave_code_t not null,
  entitled_hours numeric not null default 0,   -- (วันสิทธิ์ * 7.5)
  carried_hours  numeric not null default 0,   -- ยกมาจากปีก่อน (พักร้อนเท่านั้น)
  used_hours     numeric not null default 0,
  updated_at    timestamptz not null default now(),
  unique (employee_id, year, leave_code)
);

create table if not exists leave_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id),
  leave_code   leave_code_t not null,
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  hours        numeric not null,             -- คำนวณฝั่งแอป (เต็มวัน=7.5)
  reason       text,
  cert_url     text,                         -- ใบรับรองแพทย์ (ป่วย >=3 วัน)
  status       request_status_t not null default 'draft',
  approver_id  uuid references employees(id),
  decided_at   timestamptz,
  exported_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_at > start_at)
);
create index if not exists idx_leave_emp on leave_requests(employee_id, status);

-- =============================================================================
-- 5) ATTENDANCE / OFFSITE / OT / WFH
-- =============================================================================
create table if not exists work_locations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  lat          double precision not null,
  lng          double precision not null,
  radius_m     int not null default 200,     -- รัศมี default 200 ม.
  required_photos int not null default 1,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- คำขอ/อนุมัติ นอกสถานที่ + OT + WFH
create table if not exists field_requests (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id),
  type         attendance_type_t not null,   -- offsite | ot | wfh
  location_id  uuid references work_locations(id),  -- null ได้ถ้า wfh
  work_date    date not null,
  planned_start timestamptz,
  planned_end   timestamptz,
  reason        text,
  weekly_report text,                          -- WFH: รายงานผลรายสัปดาห์
  ot_hours      numeric,                       -- คำนวณ: เฉพาะหลัง 17:00 (ก่อน 08:30 ไม่นับ)
  ot_type       ot_type_t,
  status        request_status_t not null default 'draft',
  approver_id   uuid references employees(id),
  decided_at    timestamptz,
  exported_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_field_emp on field_requests(employee_id, status);

-- การเช็คอินจริง (GPS + เซลฟี่ + รูปหน้างาน) ; WFH ใช้ slot เช้า/เย็น
create table if not exists attendance_checkins (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references employees(id),
  field_request_id uuid references field_requests(id) on delete cascade,
  location_id     uuid references work_locations(id),
  kind            checkin_kind_t not null,    -- in|out|wfh_morning|wfh_evening
  happened_at     timestamptz not null default now(),
  gps_lat         double precision,
  gps_lng         double precision,
  distance_m      int,                         -- ระยะห่างจากจุด (ตรวจ <= radius)
  within_radius   boolean,
  selfie_url      text,
  photo_url       text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_checkin_emp on attendance_checkins(employee_id, happened_at);

-- =============================================================================
-- 6) BOOKING (รถตู้ + ห้องประชุม) — กันชนเวลาด้วย EXCLUDE
-- =============================================================================
create table if not exists vehicles (
  id     uuid primary key default gen_random_uuid(),
  name   text not null,
  plate  text,
  driver_id uuid references employees(id),     -- คนขับ (เป็นพนักงาน ล็อกอินได้)
  active boolean not null default true
);

create table if not exists van_bookings (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references vehicles(id),
  requester_id uuid not null references employees(id),
  driver_id    uuid references employees(id),
  destination  text,
  purpose      text,
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  status       booking_status_t not null default 'booked',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_at > start_at),
  -- จองซ้ำเวลาเดียวกันไม่ได้ (เฉพาะ booked)
  constraint van_no_overlap exclude using gist (
    vehicle_id with =,
    tstzrange(start_at, end_at) with &&
  ) where (status = 'booked')
);

create table if not exists van_passengers (
  booking_id  uuid not null references van_bookings(id) on delete cascade,
  employee_id uuid not null references employees(id),
  primary key (booking_id, employee_id)
);

create table if not exists rooms (
  id     uuid primary key default gen_random_uuid(),
  name   text not null,
  size   text,                                 -- 'small' | 'large'
  active boolean not null default true
);

create table if not exists room_bookings (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references rooms(id),
  requester_id uuid not null references employees(id),
  title        text,
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  status       booking_status_t not null default 'booked',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_at > start_at),
  constraint room_no_overlap exclude using gist (
    room_id with =,
    tstzrange(start_at, end_at) with &&
  ) where (status = 'booked')
);

-- =============================================================================
-- 7) CALENDAR (two-way Google sync)
-- =============================================================================
create table if not exists calendar_events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  type          cal_type_t not null,
  scope         cal_scope_t not null default 'org',
  department_id uuid references departments(id),
  owner_id      uuid references employees(id),
  start_at      timestamptz not null,
  end_at        timestamptz,
  all_day       boolean not null default false,
  source_module text,                          -- 'leave' | 'van' | 'room' | manual
  source_id     uuid,
  google_event_id text,                        -- สำหรับ two-way sync
  google_etag     text,
  last_synced_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_cal_time on calendar_events(start_at);
create index if not exists idx_cal_google on calendar_events(google_event_id);

-- =============================================================================
-- 8) ASSET MANAGEMENT
-- =============================================================================
create table if not exists assets (
  id            uuid primary key default gen_random_uuid(),
  asset_tag     text unique,
  category      text not null,                 -- mouse|keyboard|monitor|pc|laptop|pointer|power_strip|camera|tripod|portable_internet|bag|software|other
  name          text not null,
  brand         text,
  model         text,
  serial        text,
  price         numeric,
  vendor        text,
  purchase_date date,
  -- software license
  license_key   text,
  license_seats int,
  license_expires_at date,
  status        asset_status_t not null default 'in_stock',
  current_holder_id uuid references employees(id),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_asset_holder on assets(current_holder_id);
create index if not exists idx_asset_status on assets(status);

create table if not exists asset_assignments (
  id           uuid primary key default gen_random_uuid(),
  asset_id     uuid not null references assets(id) on delete cascade,
  employee_id  uuid not null references employees(id),
  assigned_by  uuid references employees(id),
  assigned_at  timestamptz not null default now(),
  accepted_at  timestamptz,                    -- พนักงานกดยอมรับ
  returned_at  timestamptz,                    -- พนักงานกดส่งคืน
  status       assign_status_t not null default 'pending_accept',
  created_at   timestamptz not null default now()
);
create index if not exists idx_assign_emp on asset_assignments(employee_id, status);

-- =============================================================================
-- 9) TRIGGERS : updated_at, audit, ลิงก์ผู้ใช้, กติกาอนุมัติ
-- =============================================================================
create or replace function set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['employees','leave_requests','leave_balances','field_requests',
      'van_bookings','room_bookings','calendar_events','assets'] loop
    execute format('drop trigger if exists trg_updated_%1$s on %1$s;', t);
    execute format('create trigger trg_updated_%1$s before update on %1$s
                    for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- audit (SECURITY DEFINER เพื่อ insert ได้แม้ RLS เปิด)
create or replace function audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs(actor_id, action, entity, entity_id, before, after)
  values (current_employee_id(), tg_op, tg_table_name,
          coalesce(new.id, old.id),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['leave_requests','field_requests','van_bookings','room_bookings',
      'assets','asset_assignments','employees'] loop
    execute format('drop trigger if exists trg_audit_%1$s on %1$s;', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$s
                    for each row execute function audit_trigger();', t);
  end loop;
end $$;

-- ลิงก์ auth.users -> employees ตอนล็อกอินครั้งแรก (+ บังคับโดเมน irdp.org)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  if new.email is null or new.email not ilike '%@irdp.org' then
    raise exception 'อนุญาตเฉพาะอีเมลโดเมน irdp.org';
  end if;
  update employees set user_id = new.id, status = 'active'
   where email = new.email and user_id is null;
  -- ถ้าไม่มีแถวพนักงานที่ HR เตรียมไว้ -> เข้าถึงข้อมูลไม่ได้ (RLS ปฏิเสธ) = pending
  return new;
end $$;
drop trigger if exists trg_link_employee on auth.users;
create trigger trg_link_employee after insert on auth.users
  for each row execute function handle_new_user();

-- กติกาอนุมัติร่วม (ใช้กับ leave_requests + field_requests)
--  • hr อนุมัติ/ตีกลับไม่ได้ (แก้เวลาได้)  • หลัง approved พนักงานแก้ไม่ได้
--  • ตอนตั้ง approved/rejected/returned ให้ stamp ผู้ตัดสิน
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
  return new;
end $$;

drop trigger if exists trg_rules_leave on leave_requests;
create trigger trg_rules_leave before update on leave_requests
  for each row execute function enforce_request_rules();
drop trigger if exists trg_rules_field on field_requests;
create trigger trg_rules_field before update on field_requests
  for each row execute function enforce_request_rules();

-- =============================================================================
-- 10) DIRECTORY VIEW (รายชื่อพนักงานปลอดภัย สำหรับ picker — เฉพาะคอลัมน์ที่ไม่อ่อนไหว)
-- =============================================================================
create or replace view employee_directory as
  select id, full_name, department_id, position, avatar_url, role, status
  from employees;   -- view รันด้วยสิทธิ์ owner = bypass RLS, เปิดเฉพาะคอลัมน์ปลอดภัย

-- =============================================================================
-- 11) ENABLE RLS + POLICIES
-- =============================================================================
alter table departments        enable row level security;
alter table employees          enable row level security;
alter table attachments        enable row level security;
alter table approvals          enable row level security;
alter table audit_logs         enable row level security;
alter table notifications      enable row level security;
alter table push_subscriptions enable row level security;
alter table leave_types        enable row level security;
alter table leave_balances     enable row level security;
alter table leave_requests     enable row level security;
alter table work_locations     enable row level security;
alter table field_requests     enable row level security;
alter table attendance_checkins enable row level security;
alter table vehicles           enable row level security;
alter table van_bookings       enable row level security;
alter table van_passengers     enable row level security;
alter table rooms              enable row level security;
alter table room_bookings      enable row level security;
alter table calendar_events    enable row level security;
alter table assets             enable row level security;
alter table asset_assignments  enable row level security;

-- ---- lookup/config: อ่านได้ทุกคน, เขียนเฉพาะ hr/admin ----
create policy dept_read   on departments for select to authenticated using (true);
create policy dept_write  on departments for all to authenticated using (can_edit()) with check (can_edit());
create policy ltype_read  on leave_types for select to authenticated using (true);
create policy ltype_write on leave_types for all to authenticated using (can_edit()) with check (can_edit());
create policy loc_read    on work_locations for select to authenticated using (true);
create policy loc_write   on work_locations for all to authenticated using (can_edit()) with check (can_edit());
create policy veh_read    on vehicles for select to authenticated using (true);
create policy veh_write   on vehicles for all to authenticated using (is_admin()) with check (is_admin());
create policy room_read   on rooms for select to authenticated using (true);
create policy room_write  on rooms for all to authenticated using (can_edit()) with check (can_edit());

-- ---- employees ----
create policy emp_select on employees for select to authenticated
  using (user_id = auth.uid() or is_oversight() or is_head_of(department_id));
create policy emp_insert on employees for insert to authenticated
  with check (can_edit());                         -- hr/admin provision
create policy emp_update on employees for update to authenticated
  using (can_edit() or user_id = auth.uid())
  with check (can_edit() or user_id = auth.uid()); -- (คอลัมน์อ่อนไหวควรล็อกที่แอป/trigger เพิ่ม)
create policy emp_delete on employees for delete to authenticated using (is_admin());

-- ---- notifications / push ----
create policy notif_select on notifications for select to authenticated
  using (user_id = current_employee_id());
create policy notif_update on notifications for update to authenticated
  using (user_id = current_employee_id()) with check (user_id = current_employee_id());
create policy push_all on push_subscriptions for all to authenticated
  using (user_id = current_employee_id()) with check (user_id = current_employee_id());

-- ---- audit / approvals / attachments ----
create policy audit_select on audit_logs for select to authenticated using (is_oversight());
create policy appr_select on approvals for select to authenticated
  using (is_oversight() or actor_id = current_employee_id() or is_dept_head());
create policy appr_insert on approvals for insert to authenticated
  with check (actor_id = current_employee_id());
create policy att_select on attachments for select to authenticated
  using (is_oversight() or uploaded_by = current_employee_id() or is_dept_head());
create policy att_insert on attachments for insert to authenticated
  with check (uploaded_by = current_employee_id() or can_edit());

-- ---- leave_balances ----
create policy bal_select on leave_balances for select to authenticated
  using (employee_id = current_employee_id() or is_oversight()
         or exists (select 1 from employees e where e.id = leave_balances.employee_id and is_head_of(e.department_id)));
create policy bal_write on leave_balances for all to authenticated
  using (can_edit()) with check (can_edit());

-- ---- leave_requests (request pattern) ----
create policy leave_select on leave_requests for select to authenticated
  using (employee_id = current_employee_id() or is_oversight()
         or exists (select 1 from employees e where e.id = leave_requests.employee_id and is_head_of(e.department_id)));
create policy leave_insert on leave_requests for insert to authenticated
  with check (employee_id = current_employee_id());
create policy leave_update on leave_requests for update to authenticated
  using (
     (employee_id = current_employee_id() and status in ('draft','returned'))   -- เจ้าของแก้ก่อนอนุมัติ
     or is_oversight()                                                          -- hr/admin/exec แก้ได้ (กติกาอนุมัติคุมด้วย trigger)
     or exists (select 1 from employees e where e.id = leave_requests.employee_id and is_head_of(e.department_id))
  );
create policy leave_delete on leave_requests for delete to authenticated using (is_admin());

-- ---- field_requests (offsite/ot/wfh) — pattern เดียวกับ leave ----
create policy field_select on field_requests for select to authenticated
  using (employee_id = current_employee_id() or is_oversight()
         or exists (select 1 from employees e where e.id = field_requests.employee_id and is_head_of(e.department_id)));
create policy field_insert on field_requests for insert to authenticated
  with check (employee_id = current_employee_id());
create policy field_update on field_requests for update to authenticated
  using (
     (employee_id = current_employee_id() and status in ('draft','returned'))
     or is_oversight()
     or exists (select 1 from employees e where e.id = field_requests.employee_id and is_head_of(e.department_id))
  );
create policy field_delete on field_requests for delete to authenticated using (is_admin());

-- ---- attendance_checkins ----
create policy ci_select on attendance_checkins for select to authenticated
  using (employee_id = current_employee_id() or is_oversight()
         or exists (select 1 from employees e where e.id = attendance_checkins.employee_id and is_head_of(e.department_id)));
create policy ci_insert on attendance_checkins for insert to authenticated
  with check (employee_id = current_employee_id());
create policy ci_update on attendance_checkins for update to authenticated
  using (can_edit()) with check (can_edit());      -- แก้เวลา = hr/admin

-- ---- bookings (เห็นทุกคนเพื่อดูคิว/รู้ว่าซ้ำกับใคร ; พนักงานแก้ไม่ได้หลังจอง) ----
create policy van_select on van_bookings for select to authenticated using (true);
create policy van_insert on van_bookings for insert to authenticated
  with check (requester_id = current_employee_id());
create policy van_update on van_bookings for update to authenticated
  using (can_edit() or (requester_id = current_employee_id()))         -- เจ้าของยกเลิกได้เท่านั้น
  with check (can_edit() or (requester_id = current_employee_id() and status = 'cancelled'));
create policy van_delete on van_bookings for delete to authenticated using (is_admin());

create policy pax_select on van_passengers for select to authenticated using (true);
create policy pax_write on van_passengers for all to authenticated
  using (can_edit() or exists (select 1 from van_bookings b where b.id = booking_id and b.requester_id = current_employee_id()))
  with check (can_edit() or exists (select 1 from van_bookings b where b.id = booking_id and b.requester_id = current_employee_id()));

create policy roomb_select on room_bookings for select to authenticated using (true);
create policy roomb_insert on room_bookings for insert to authenticated
  with check (requester_id = current_employee_id());
create policy roomb_update on room_bookings for update to authenticated
  using (can_edit() or requester_id = current_employee_id())
  with check (can_edit() or (requester_id = current_employee_id() and status = 'cancelled'));
create policy roomb_delete on room_bookings for delete to authenticated using (is_admin());

-- ---- calendar ----
create policy cal_select on calendar_events for select to authenticated using (
     scope = 'org'
  or is_oversight()
  or (scope = 'dept' and department_id = current_dept())
  or (scope = 'personal' and owner_id = current_employee_id())
);
create policy cal_write on calendar_events for all to authenticated
  using (can_edit() or owner_id = current_employee_id())
  with check (can_edit() or owner_id = current_employee_id());

-- ---- assets : IT(admin) จัดการ ; hr/exec/dept_head อ่านทั้งหมด ; พนักงานเห็นของตัวเอง ----
create policy asset_select on assets for select to authenticated
  using (is_oversight() or is_dept_head() or current_holder_id = current_employee_id());
create policy asset_write on assets for all to authenticated
  using (is_admin()) with check (is_admin());

create policy assign_select on asset_assignments for select to authenticated
  using (employee_id = current_employee_id() or is_oversight() or is_dept_head());
create policy assign_insert on asset_assignments for insert to authenticated
  with check (is_admin());                          -- IT ลิงก์ทรัพย์สิน
create policy assign_update on asset_assignments for update to authenticated
  using (is_admin() or employee_id = current_employee_id())    -- พนักงานกดยอมรับ/ส่งคืนของตัวเอง
  with check (is_admin() or employee_id = current_employee_id());

-- =============================================================================
-- 12) SEED
-- =============================================================================
insert into departments(name) values ('ธุรการ'),('ประเมิน'),('วิจัย'),('อบรม')
  on conflict (name) do nothing;

insert into leave_types(code,name_th,default_annual_days,accrues_by_tenure,carry_over) values
  ('sick','ลาป่วย',30,false,false),
  ('personal','ลากิจ',10,false,false),
  ('vacation','ลาพักร้อน',null,true,true)
  on conflict (code) do nothing;

insert into rooms(name,size) values ('ห้องเคียงตะวัน','small'),('ห้องอิงจันทร์','large')
  on conflict do nothing;

insert into vehicles(name,plate) values ('รถตู้ส่วนกลาง',null)
  on conflict do nothing;

insert into work_locations(name,lat,lng,radius_m) values
  ('สำนักงาน IRDP (อาคารเอ็กซิม ชั้น 17)',13.7795,100.5398,200)
  on conflict do nothing;

-- =============================================================================
-- หมายเหตุถัดไป (เฟส 1+):
--  • Storage buckets: avatars / leave-certs / checkin-photos / asset-docs + policies
--  • Edge Function/cron: recompute leave_balances, ส่ง web push, Google Calendar two-way sync
--  • OT calc: นับเฉพาะ > 17:00 (วันทำงาน ×1.5) ; วันหยุดในเวลา ×1 ; วันหยุดเกินเวลา ×3 ; OT>=2ชม. หัก 20 นาที ; เตือน >36ชม./สัปดาห์ ; ผอ.ฝ่ายขึ้นไปไม่มี OT
--  • WFH: บล็อกการขอ OT ในวันเดียวกัน
-- =============================================================================
