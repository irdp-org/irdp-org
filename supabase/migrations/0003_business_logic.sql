-- =============================================================================
-- IRDP — 0003 : Business logic (OT calc + leave balance recompute)
-- รันหลัง 0001, 0002
-- กฎที่ฝังไว้:
--   • OT นับเฉพาะเวลา > 17:00 (ก่อน 08:30 ไม่นับ) ; วันทำงาน ×1.5
--   • วันหยุด: ชม.ในเวลา 08:30-17:00 (หักพักเที่ยง) ×1 ; เกิน 17:00 ×3
--   • OT ส่วนหลังเวลาปกติ ≥ 2 ชม. -> หักพัก 20 นาที
--   • ผอ.ฝ่าย/ผู้บริหาร (dept_head, exec) ไม่มีสิทธิ์ OT
--   • วัน WFH -> เบิก OT ไม่ได้
--   • ลาเป็นชั่วโมง เต็มวัน=7.5 ; พักร้อนสะสมข้ามปี 1 ปี (FIFO ใช้ของเก่าก่อน)
-- เวลาอ้างอิงโซน Asia/Bangkok
-- =============================================================================

-- ---------- วันหยุด: เสาร์/อาทิตย์ หรือ มี event type='holiday' ----------
create or replace function is_holiday(p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select extract(isodow from p_date) in (6,7)                 -- 6=เสาร์ 7=อาทิตย์
      or exists (select 1 from calendar_events c
                 where c.type = 'holiday'
                   and (c.start_at at time zone 'Asia/Bangkok')::date = p_date);
$$;

-- =============================================================================
-- คำนวณ OT (คืน jsonb breakdown)
-- =============================================================================
create or replace function fn_compute_ot(p_emp uuid, p_date date, p_start timestamptz, p_end timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  tz        text := 'Asia/Bangkok';
  t0830 timestamptz := (p_date::timestamp + time '08:30') at time zone tz;
  t1200 timestamptz := (p_date::timestamp + time '12:00') at time zone tz;
  t1300 timestamptz := (p_date::timestamp + time '13:00') at time zone tz;
  t1700 timestamptz := (p_date::timestamp + time '17:00') at time zone tz;
  r role_t;
  eligible boolean;
  holiday  boolean := is_holiday(p_date);
  after17_min numeric := 0;
  normal_min  numeric := 0;
  lunch_min   numeric := 0;
  normal_worked numeric := 0;
  x1 numeric := 0; x15 numeric := 0; x3 numeric := 0;
  break_min int := 0;
  ot_type text := null;
begin
  select role into r from employees where id = p_emp;
  eligible := r is not null and r not in ('dept_head','exec');

  if not eligible or p_start is null or p_end is null or p_end <= p_start then
    return jsonb_build_object('eligible',eligible,'holiday',holiday,
      'x1_hours',0,'x1_5_hours',0,'x3_hours',0,'ot_hours',0,'ot_type',null,'break_min',0);
  end if;

  after17_min := greatest(0, extract(epoch from (p_end - greatest(p_start, t1700)))/60);
  normal_min  := greatest(0, extract(epoch from (least(p_end,t1700) - greatest(p_start,t0830)))/60);
  lunch_min   := greatest(0, extract(epoch from (least(p_end,t1300) - greatest(p_start,t1200)))/60);
  normal_worked := greatest(0, normal_min - lunch_min);

  if holiday then
    x1 := normal_worked / 60.0;                 -- ทำงานวันหยุดในเวลา ×1
    if after17_min >= 120 then break_min := 20; end if;
    x3 := greatest(0, after17_min - break_min) / 60.0;   -- วันหยุดเกินเวลา ×3
    ot_type := case when x3 > 0 then 'holiday_ot' else 'holiday_normal' end;
  else
    if after17_min >= 120 then break_min := 20; end if;
    x15 := greatest(0, after17_min - break_min) / 60.0;  -- วันทำงาน ×1.5
    ot_type := 'weekday_ot';
  end if;

  x1  := round(x1,2);  x15 := round(x15,2);  x3 := round(x3,2);

  return jsonb_build_object(
    'eligible',true,'holiday',holiday,
    'x1_hours',x1,'x1_5_hours',x15,'x3_hours',x3,
    'ot_hours', round(x15 + x3, 2),           -- "ล่วงเวลา" รวม (×1.5 + ×3)
    'ot_type', ot_type, 'break_min', break_min
  );
end $$;
grant execute on function fn_compute_ot(uuid,date,timestamptz,timestamptz) to authenticated;

-- เพิ่มคอลัมน์เก็บ breakdown ใน field_requests
alter table field_requests
  add column if not exists pay_x1_hours  numeric not null default 0,
  add column if not exists pay_x15_hours numeric not null default 0,
  add column if not exists pay_x3_hours  numeric not null default 0,
  add column if not exists ot_breakdown  jsonb;

-- เติมค่า OT อัตโนมัติ + บล็อก OT วัน WFH (BEFORE insert/update)
create or replace function fn_field_autofill() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb;
begin
  if new.type in ('ot','offsite') then
    if exists (select 1 from field_requests f
               where f.employee_id = new.employee_id and f.type='wfh'
                 and f.status='approved' and f.work_date = new.work_date) then
      raise exception 'วันที่ % เป็นวัน WFH จึงเบิก OT/นอกสถานที่ไม่ได้ (ระเบียบ 2567)', new.work_date;
    end if;
    if new.planned_start is not null and new.planned_end is not null then
      j := fn_compute_ot(new.employee_id, new.work_date, new.planned_start, new.planned_end);
      new.pay_x1_hours  := (j->>'x1_hours')::numeric;
      new.pay_x15_hours := (j->>'x1_5_hours')::numeric;
      new.pay_x3_hours  := (j->>'x3_hours')::numeric;
      new.ot_hours      := (j->>'ot_hours')::numeric;
      new.ot_type       := nullif(j->>'ot_type','')::ot_type_t;
      new.ot_breakdown  := j;
    end if;
  elsif new.type = 'wfh' then
    new.ot_hours := null; new.ot_type := null;
    new.pay_x1_hours := 0; new.pay_x15_hours := 0; new.pay_x3_hours := 0;
  end if;
  return new;
end $$;

drop trigger if exists trg_field_autofill on field_requests;
create trigger trg_field_autofill before insert or update on field_requests
  for each row execute function fn_field_autofill();

-- สรุป OT รายสัปดาห์ (จ-อา) + เตือนเกิน 36 ชม. (ระเบียบข้อ 12)
create or replace function fn_weekly_ot_summary(p_emp uuid, p_date date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ws date := (date_trunc('week', p_date::timestamp))::date;  -- จันทร์
        we date := (date_trunc('week', p_date::timestamp))::date + 6;
        total numeric;
begin
  select coalesce(sum(ot_hours),0) into total from field_requests
   where employee_id = p_emp and type in ('ot','offsite')
     and status in ('submitted','approved')
     and work_date between ws and we;
  return jsonb_build_object('week_start',ws,'week_end',we,
                            'week_ot_hours', round(total,2), 'over_36', total > 36);
end $$;
grant execute on function fn_weekly_ot_summary(uuid,date) to authenticated;

-- =============================================================================
-- LEAVE BALANCE — recompute
-- =============================================================================
-- พักร้อนยกมา (carried) เข้า year : วนจากปีเริ่มงาน ใช้ของเก่าก่อน (FIFO) เก็บได้ 1 ปี
create or replace function fn_vacation_carried_hours(p_emp uuid, p_year int)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare hire date; hy int; carried numeric := 0; ent numeric; used numeric; y int;
begin
  select hire_date into hire from employees where id = p_emp;
  if hire is null then return 0; end if;
  hy := extract(year from hire);
  for y in hy..(p_year-1) loop
    ent := fn_vacation_days(hire, y) * 7.5;
    select coalesce(sum(hours),0) into used from leave_requests
      where employee_id = p_emp and leave_code='vacation' and status='approved'
        and extract(year from (start_at at time zone 'Asia/Bangkok')) = y;
    if y = hy then
      carried := 0;                               -- ปีแรกใช้ในปีนั้น ไม่ทบ
    else
      carried := greatest(0, ent - greatest(0, used - carried));  -- ใช้ carried เก่าก่อน เหลือ ent ยกไป
    end if;
  end loop;
  return round(carried, 2);
end $$;

-- recompute ทั้ง 3 ประเภทของพนักงานในปีหนึ่ง (upsert ลง leave_balances)
create or replace function fn_recompute_leave_balance(p_emp uuid, p_year int)
returns void language plpgsql security definer set search_path = public as $$
declare hire date; sick_days numeric; personal_days numeric;
        v_ent numeric; v_car numeric; u numeric;
begin
  select hire_date into hire from employees where id = p_emp;
  select default_annual_days into sick_days     from leave_types where code='sick';
  select default_annual_days into personal_days from leave_types where code='personal';

  -- ป่วย
  select coalesce(sum(hours),0) into u from leave_requests
    where employee_id=p_emp and leave_code='sick' and status='approved'
      and extract(year from (start_at at time zone 'Asia/Bangkok'))=p_year;
  insert into leave_balances(employee_id,year,leave_code,entitled_hours,carried_hours,used_hours)
  values (p_emp,p_year,'sick', coalesce(sick_days,30)*7.5, 0, u)
  on conflict (employee_id,year,leave_code) do update
    set entitled_hours=excluded.entitled_hours, carried_hours=0, used_hours=excluded.used_hours, updated_at=now();

  -- กิจ
  select coalesce(sum(hours),0) into u from leave_requests
    where employee_id=p_emp and leave_code='personal' and status='approved'
      and extract(year from (start_at at time zone 'Asia/Bangkok'))=p_year;
  insert into leave_balances(employee_id,year,leave_code,entitled_hours,carried_hours,used_hours)
  values (p_emp,p_year,'personal', coalesce(personal_days,10)*7.5, 0, u)
  on conflict (employee_id,year,leave_code) do update
    set entitled_hours=excluded.entitled_hours, carried_hours=0, used_hours=excluded.used_hours, updated_at=now();

  -- พักร้อน (มี carryover)
  v_ent := fn_vacation_days(hire, p_year) * 7.5;
  v_car := fn_vacation_carried_hours(p_emp, p_year);
  select coalesce(sum(hours),0) into u from leave_requests
    where employee_id=p_emp and leave_code='vacation' and status='approved'
      and extract(year from (start_at at time zone 'Asia/Bangkok'))=p_year;
  insert into leave_balances(employee_id,year,leave_code,entitled_hours,carried_hours,used_hours)
  values (p_emp,p_year,'vacation', v_ent, v_car, u)
  on conflict (employee_id,year,leave_code) do update
    set entitled_hours=excluded.entitled_hours, carried_hours=excluded.carried_hours,
        used_hours=excluded.used_hours, updated_at=now();
end $$;

-- sync balance อัตโนมัติเมื่อคำขอลาเปลี่ยน
create or replace function fn_leave_balance_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT','UPDATE') then
    perform fn_recompute_leave_balance(new.employee_id,
      extract(year from (new.start_at at time zone 'Asia/Bangkok'))::int);
  end if;
  if tg_op in ('UPDATE','DELETE') then
    perform fn_recompute_leave_balance(old.employee_id,
      extract(year from (old.start_at at time zone 'Asia/Bangkok'))::int);
  end if;
  return null;
end $$;

drop trigger if exists trg_leave_balance_sync on leave_requests;
create trigger trg_leave_balance_sync after insert or update or delete on leave_requests
  for each row execute function fn_leave_balance_sync();

-- view: คงเหลือ = ได้สิทธิ์ + ยกมา - ใช้ไป (RLS ของ leave_balances มีผล)
create or replace view leave_balance_view
  with (security_invoker = true) as
  select b.*,
         (b.entitled_hours + b.carried_hours - b.used_hours)            as available_hours,
         round((b.entitled_hours + b.carried_hours - b.used_hours)/7.5,2) as available_days
  from leave_balances b;
grant select on leave_balance_view to authenticated;

-- =============================================================================
-- ตัวอย่าง / วิธีใช้:
--   ดูตัวอย่าง OT 06:00–22:30 วันทำงาน (ควรได้ ×1.5 = 5.5 ชม. หัก 20 นาที):
--   select fn_compute_ot('<emp-uuid>','2026-06-23',
--          '2026-06-23 06:00+07','2026-06-23 22:30+07');
--   recompute balance ของพนักงานทั้งปี (เรียกตอน import ครั้งแรก/seed):
--   select fn_recompute_leave_balance('<emp-uuid>', 2026);
-- หมายเหตุ: เวลาทำงานก่อน 08:30 ไม่ถูกนับเป็น OT ตามที่ตกลง
-- =============================================================================
