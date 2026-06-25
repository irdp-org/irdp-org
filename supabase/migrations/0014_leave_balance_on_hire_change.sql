-- Trigger: recompute leave balances for current year whenever hire_date changes.
-- Fixes the case where an admin edits hire_date but existing leave_balances
-- rows still reflect the old quota.

create or replace function fn_employee_hire_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare cur_year int := extract(year from now());
begin
  if old.hire_date is distinct from new.hire_date then
    perform fn_recompute_leave_balance(new.id, cur_year);
    -- Also recompute previous year in case we are in Jan and carried hours matter
    if extract(month from now()) = 1 then
      perform fn_recompute_leave_balance(new.id, cur_year - 1);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_employee_hire_changed on employees;
create trigger trg_employee_hire_changed
  after update of hire_date on employees
  for each row execute function fn_employee_hire_changed();
