-- Add desk_phone column to employees
alter table employees add column if not exists desk_phone text;

-- Rebuild employee_directory view to include desk_phone
drop view if exists employee_directory;
create view employee_directory as
  select id, full_name, nickname, department_id, position, avatar_url, role, status, phone, desk_phone, email, birthdate
  from employees;
