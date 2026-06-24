-- =============================================================================
-- IRDP — 0007 : Booking → Calendar sync triggers
-- รันหลัง 0001-0006. ไม่แก้ไฟล์เดิม — เพิ่มเติมเท่านั้น.
--
-- สิ่งที่ทำ:
--   1) fn_van_booking_calendar_sync() — trigger บน van_bookings
--      • INSERT status='booked' → INSERT calendar_events (type='booking', scope='org')
--      • UPDATE status→'cancelled' → DELETE calendar_events (source_module='van')
--      • UPDATE อื่นๆ (แก้ destination/เวลา) → UPDATE calendar_events
--   2) fn_room_booking_calendar_sync() — trigger บน room_bookings (pattern เดียวกัน)
--
-- หมายเหตุ: DB trigger ทำได้แค่ INSERT/UPDATE/DELETE ใน calendar_events
--   Google Calendar push (HTTP) ทำใน server action ฝั่ง Next.js แยกต่างหาก
--   เพราะ trigger ไม่สามารถเรียก HTTP ได้
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Van booking ↔ calendar_events
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function fn_van_booking_calendar_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_requester_name text;
  v_title          text;
begin
  if tg_op = 'INSERT' and new.status = 'booked' then
    select full_name into v_requester_name from employees where id = new.requester_id;
    v_title := 'จองรถ: ' || coalesce(new.destination, 'ไม่ระบุปลายทาง')
               || ' — ' || coalesce(v_requester_name, '');
    insert into calendar_events(title, type, scope, owner_id, start_at, end_at, all_day, source_module, source_id)
    values (v_title, 'booking', 'org', new.requester_id, new.start_at, new.end_at, false, 'van', new.id);

  elsif tg_op = 'UPDATE' then
    if new.status = 'cancelled' and old.status <> 'cancelled' then
      delete from calendar_events where source_module = 'van' and source_id = new.id;
    else
      -- แก้ destination หรือเวลา → update title + times
      select full_name into v_requester_name from employees where id = new.requester_id;
      v_title := 'จองรถ: ' || coalesce(new.destination, 'ไม่ระบุปลายทาง')
                 || ' — ' || coalesce(v_requester_name, '');
      update calendar_events
        set title      = v_title,
            start_at   = new.start_at,
            end_at     = new.end_at,
            updated_at = now()
        where source_module = 'van' and source_id = new.id;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_van_booking_calendar on van_bookings;
create trigger trg_van_booking_calendar
  after insert or update on van_bookings
  for each row execute function fn_van_booking_calendar_sync();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Room booking ↔ calendar_events
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function fn_room_booking_calendar_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_room_name text;
  v_title     text;
begin
  if tg_op = 'INSERT' and new.status = 'booked' then
    select name into v_room_name from rooms where id = new.room_id;
    v_title := 'จองห้อง ' || coalesce(v_room_name, '') || ': ' || coalesce(new.title, 'ไม่ระบุหัวข้อ');
    insert into calendar_events(title, type, scope, owner_id, start_at, end_at, all_day, source_module, source_id)
    values (v_title, 'booking', 'org', new.requester_id, new.start_at, new.end_at, false, 'room', new.id);

  elsif tg_op = 'UPDATE' then
    if new.status = 'cancelled' and old.status <> 'cancelled' then
      delete from calendar_events where source_module = 'room' and source_id = new.id;
    else
      select name into v_room_name from rooms where id = new.room_id;
      v_title := 'จองห้อง ' || coalesce(v_room_name, '') || ': ' || coalesce(new.title, 'ไม่ระบุหัวข้อ');
      update calendar_events
        set title      = v_title,
            start_at   = new.start_at,
            end_at     = new.end_at,
            updated_at = now()
        where source_module = 'room' and source_id = new.id;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_room_booking_calendar on room_bookings;
create trigger trg_room_booking_calendar
  after insert or update on room_bookings
  for each row execute function fn_room_booking_calendar_sync();
