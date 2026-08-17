-- =============================================================================
-- IRDP — จองกล้อง (camera_bookings)
--
-- บริษัทมีกล้องถ่ายรูปประชาสัมพันธ์ 1 ตัว — เพิ่มเป็นหมวดจองใหม่ (เหมือนรถตู้:
-- ทรัพยากรชิ้นเดียว ใครก็จองได้ ไม่มีผู้ร่วมเดินทาง) แสดงรวมในปฏิทินจองพร้อม
-- รถตู้/ห้องประชุม
-- =============================================================================

create table if not exists camera_bookings (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references employees(id),
  location     text,                  -- เอาไปใช้ที่ไหน
  purpose      text,                  -- ใช้ทำงานอะไร
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  status       booking_status_t not null default 'booked',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_at > start_at),
  constraint camera_no_overlap exclude using gist (
    tstzrange(start_at, end_at) with &&
  ) where (status = 'booked')
);

alter table camera_bookings enable row level security;

drop policy if exists camerab_select on camera_bookings;
drop policy if exists camerab_insert on camera_bookings;
drop policy if exists camerab_update on camera_bookings;
drop policy if exists camerab_delete on camera_bookings;

create policy camerab_select on camera_bookings for select to authenticated using (true);
create policy camerab_insert on camera_bookings for insert to authenticated
  with check (requester_id = current_employee_id());
create policy camerab_update on camera_bookings for update to authenticated
  using (can_edit() or requester_id = current_employee_id())
  with check (can_edit() or (requester_id = current_employee_id() and status = 'cancelled'));
create policy camerab_delete on camera_bookings for delete to authenticated using (is_admin());

-- ── camera_bookings ↔ calendar_events (pattern เดียวกับ 0007) ────────────────
create or replace function fn_camera_booking_calendar_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_requester_name text;
  v_title          text;
begin
  if tg_op = 'INSERT' and new.status = 'booked' then
    select full_name into v_requester_name from employees where id = new.requester_id;
    v_title := 'จองกล้อง: ' || coalesce(new.purpose, 'ไม่ระบุงาน')
               || ' — ' || coalesce(v_requester_name, '');
    insert into calendar_events(title, type, scope, owner_id, start_at, end_at, all_day, source_module, source_id)
    values (v_title, 'booking', 'org', new.requester_id, new.start_at, new.end_at, false, 'camera', new.id);

  elsif tg_op = 'UPDATE' then
    if new.status = 'cancelled' and old.status <> 'cancelled' then
      delete from calendar_events where source_module = 'camera' and source_id = new.id;
    else
      select full_name into v_requester_name from employees where id = new.requester_id;
      v_title := 'จองกล้อง: ' || coalesce(new.purpose, 'ไม่ระบุงาน')
                 || ' — ' || coalesce(v_requester_name, '');
      update calendar_events
        set title      = v_title,
            start_at   = new.start_at,
            end_at     = new.end_at,
            updated_at = now()
        where source_module = 'camera' and source_id = new.id;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_camera_booking_calendar on camera_bookings;
create trigger trg_camera_booking_calendar
  after insert or update on camera_bookings
  for each row execute function fn_camera_booking_calendar_sync();

drop trigger if exists trg_camerab_updated_at on camera_bookings;
create trigger trg_camerab_updated_at
  before update on camera_bookings
  for each row execute function set_updated_at();
