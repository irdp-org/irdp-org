-- สมจิตร (พนักงานขับรถ), นภัส, สุพัฒน์ (แม่บ้าน) — ฝ่ายธุรการ — เป็นพนักงาน
-- สัญญาจ้างปีต่อปี มีวันลาคงที่ทุกปี ไม่ตามอายุงานหรือ default ของพนักงานประจำ:
-- ลาป่วย 12 วัน, ลากิจ 5 วัน, ลาพักร้อน 3 วัน (ไม่มีขั้นบันไดตามปี ไม่มีทบไปปีถัดไป)
--
-- ปัจจุบันไม่มีช่องทางตั้งค่าแบบนี้ได้เลย — sick/personal ใช้
-- leave_types.default_annual_days เดียวกันทั้งองค์กร (30/10 วัน) และ vacation
-- คำนวณจาก hire_date ผ่าน fn_vacation_days() ซึ่งทั้ง 3 คนไม่มี hire_date บันทึก
-- ไว้เลย ทำให้ได้สิทธิ์ vacation = 0 วันทั้งที่ลาไปแล้วจริง (ยอดคงเหลือติดลบ)
--
-- เพิ่ม override ต่อพนักงาน แบบเดียวกับที่ vacation มีอยู่แล้วโดยปริยาย (ตาม
-- อายุงาน) — ถ้าตั้งค่า override ไว้ ให้ใช้ค่านี้แทนทั้งหมด (ไม่ทบเหมือน
-- vacation ปกติ, คงที่ทุกปีตามที่ระบุ)

alter table employees add column if not exists contract_sick_days numeric;
alter table employees add column if not exists contract_personal_days numeric;
alter table employees add column if not exists contract_vacation_days numeric;

update employees set
  contract_sick_days = 12,
  contract_personal_days = 5,
  contract_vacation_days = 3
where email in ('somchit@irdp.org', 'napat@irdp.org', 'supat@irdp.org');

create or replace function fn_recompute_leave_balance(p_emp uuid, p_year int)
returns void language plpgsql security definer set search_path = public as $$
declare hire date; sick_days numeric; personal_days numeric;
        contract_sick numeric; contract_personal numeric; contract_vacation numeric;
        v_ent numeric; v_car numeric; u numeric;
begin
  select hire_date, contract_sick_days, contract_personal_days, contract_vacation_days
    into hire, contract_sick, contract_personal, contract_vacation
    from employees where id = p_emp;
  select default_annual_days into sick_days     from leave_types where code='sick';
  select default_annual_days into personal_days from leave_types where code='personal';

  -- ป่วย
  select coalesce(sum(hours),0) into u from leave_requests
    where employee_id=p_emp and leave_code='sick' and status='approved'
      and extract(year from (start_at at time zone 'Asia/Bangkok'))=p_year;
  insert into leave_balances(employee_id,year,leave_code,entitled_hours,carried_hours,used_hours)
  values (p_emp,p_year,'sick', coalesce(contract_sick, sick_days, 30)*7.5, 0, u)
  on conflict (employee_id,year,leave_code) do update
    set entitled_hours=excluded.entitled_hours, carried_hours=0, used_hours=excluded.used_hours, updated_at=now();

  -- กิจ
  select coalesce(sum(hours),0) into u from leave_requests
    where employee_id=p_emp and leave_code='personal' and status='approved'
      and extract(year from (start_at at time zone 'Asia/Bangkok'))=p_year;
  insert into leave_balances(employee_id,year,leave_code,entitled_hours,carried_hours,used_hours)
  values (p_emp,p_year,'personal', coalesce(contract_personal, personal_days, 10)*7.5, 0, u)
  on conflict (employee_id,year,leave_code) do update
    set entitled_hours=excluded.entitled_hours, carried_hours=0, used_hours=excluded.used_hours, updated_at=now();

  -- พักร้อน (มี carryover ตามอายุงาน — ยกเว้นพนักงานสัญญาจ้างที่มี override คงที่ ไม่ทบ)
  if contract_vacation is not null then
    v_ent := contract_vacation * 7.5;
    v_car := 0;
  else
    v_ent := fn_vacation_days(hire, p_year) * 7.5;
    v_car := fn_vacation_carried_hours(p_emp, p_year);
  end if;
  select coalesce(sum(hours),0) into u from leave_requests
    where employee_id=p_emp and leave_code='vacation' and status='approved'
      and extract(year from (start_at at time zone 'Asia/Bangkok'))=p_year;
  insert into leave_balances(employee_id,year,leave_code,entitled_hours,carried_hours,used_hours)
  values (p_emp,p_year,'vacation', v_ent, v_car, u)
  on conflict (employee_id,year,leave_code) do update
    set entitled_hours=excluded.entitled_hours, carried_hours=excluded.carried_hours,
        used_hours=excluded.used_hours, updated_at=now();
end $$;
