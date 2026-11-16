-- Regression fix: 0058 (contract-staff leave override) redefined
-- fn_recompute_leave_balance by starting from the ORIGINAL 0003 version,
-- which still computed vacation carryover — undoing 0018/0023's explicit
-- "no carryover, confirmed with HR" rule without anyone noticing. Symptom:
-- vacation showing 30 days (15 entitled + 15 carried) instead of 15.
--
-- Re-applies carried_hours = 0 for vacation, keeping 0058's per-employee
-- sick/personal/vacation override intact.

create or replace function fn_recompute_leave_balance(p_emp uuid, p_year int)
returns void language plpgsql security definer set search_path = public as $$
declare hire date; sick_days numeric; personal_days numeric;
        contract_sick numeric; contract_personal numeric; contract_vacation numeric;
        v_ent numeric; u numeric;
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

  -- พักร้อน — ไม่ทบข้ามปี เสมอ (0018/0023), ยกเว้น override คงที่ของพนักงานสัญญาจ้าง (0058)
  v_ent := coalesce(contract_vacation * 7.5, fn_vacation_days(hire, p_year) * 7.5);
  select coalesce(sum(hours),0) into u from leave_requests
    where employee_id=p_emp and leave_code='vacation' and status='approved'
      and extract(year from (start_at at time zone 'Asia/Bangkok'))=p_year;
  insert into leave_balances(employee_id,year,leave_code,entitled_hours,carried_hours,used_hours)
  values (p_emp,p_year,'vacation', v_ent, 0, u)
  on conflict (employee_id,year,leave_code) do update
    set entitled_hours=excluded.entitled_hours, carried_hours=0,
        used_hours=excluded.used_hours, updated_at=now();
end $$;

-- Zero out any carryover 0058 reintroduced, then recompute everyone for the current year.
update leave_balances set carried_hours = 0 where leave_code = 'vacation' and carried_hours <> 0;

do $$
declare r record; y int := extract(year from now())::int;
begin
  for r in select id from employees loop
    perform fn_recompute_leave_balance(r.id, y);
  end loop;
end $$;
