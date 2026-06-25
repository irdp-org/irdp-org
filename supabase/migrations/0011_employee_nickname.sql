-- 0011_employee_nickname.sql
-- Add nickname column + expand employee_directory view for /directory page

alter table employees add column if not exists nickname text;

-- Expand view to include contact fields shown in the employee directory
-- Must drop first because PostgreSQL doesn't allow reordering/inserting columns via CREATE OR REPLACE
drop view if exists employee_directory;

create view employee_directory as
  select
    id,
    full_name,
    nickname,
    department_id,
    position,
    avatar_url,
    role,
    status,
    phone,
    email,
    birthdate
  from employees;
