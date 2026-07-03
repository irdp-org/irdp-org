-- Re-apply the "no vacation carryover" fix (0018) in case it wasn't run.
-- Vacation still shows 30 = 15 (this year) + 15 (carried). This makes carried
-- always 0 for vacation and recomputes everyone for the current year.
-- Entitlement schedule unchanged (1-3y=10, 4-5y=12, 6+y=15).

create or replace function fn_recompute_leave_balance(p_emp uuid, p_year int)
returns void language plpgsql security definer set search_path = public as $$
declare hire date; sick_days numeric; personal_days numeric;
        v_ent numeric; u numeric;
begin
  select hire_date into hire from employees where id = p_emp;
  select default_annual_days into sick_days     from leave_types where code='sick';
  select default_annual_days into personal_days from leave_types where code='personal';

  select coalesce(sum(hours),0) into u from leave_requests
    where employee_id=p_emp and leave_code='sick' and status='approved'
      and extract(year from (start_at at time zone 'Asia/Bangkok'))=p_year;
  insert into leave_balances(employee_id,year,leave_code,entitled_hours,carried_hours,used_hours)
  values (p_emp,p_year,'sick', coalesce(sick_days,30)*7.5, 0, u)
  on conflict (employee_id,year,leave_code) do update
    set entitled_hours=excluded.entitled_hours, carried_hours=0, used_hours=excluded.used_hours, updated_at=now();

  select coalesce(sum(hours),0) into u from leave_requests
    where employee_id=p_emp and leave_code='personal' and status='approved'
      and extract(year from (start_at at time zone 'Asia/Bangkok'))=p_year;
  insert into leave_balances(employee_id,year,leave_code,entitled_hours,carried_hours,used_hours)
  values (p_emp,p_year,'personal', coalesce(personal_days,10)*7.5, 0, u)
  on conflict (employee_id,year,leave_code) do update
    set entitled_hours=excluded.entitled_hours, carried_hours=0, used_hours=excluded.used_hours, updated_at=now();

  -- พักร้อน — ไม่ทบข้ามปี (carried = 0 เสมอ)
  v_ent := fn_vacation_days(hire, p_year) * 7.5;
  select coalesce(sum(hours),0) into u from leave_requests
    where employee_id=p_emp and leave_code='vacation' and status='approved'
      and extract(year from (start_at at time zone 'Asia/Bangkok'))=p_year;
  insert into leave_balances(employee_id,year,leave_code,entitled_hours,carried_hours,used_hours)
  values (p_emp,p_year,'vacation', v_ent, 0, u)
  on conflict (employee_id,year,leave_code) do update
    set entitled_hours=excluded.entitled_hours, carried_hours=0,
        used_hours=excluded.used_hours, updated_at=now();
end $$;

update leave_balances set carried_hours = 0 where carried_hours <> 0;

do $$
declare r record; y int := extract(year from now())::int;
begin
  for r in select id from employees loop
    perform fn_recompute_leave_balance(r.id, y);
  end loop;
end $$;
