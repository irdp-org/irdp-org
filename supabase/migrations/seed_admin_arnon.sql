-- =============================================================================
-- IRDP — Admin seed: อานนท์ แย้มโชติ (IT/Admin, ฝ่ายธุรการ)
-- รันใน Supabase SQL Editor *ก่อน* ล็อกอินครั้งแรกด้วย Google (arnon@irdp.org)
-- ทำไมต้องรันก่อน: trigger handle_new_user() จะลิงก์ user_id ให้กับแถวที่มี email
-- ตรงกันอยู่แล้วเท่านั้น — ถ้าไม่มีแถวนี้ไว้ก่อน คุณจะลิงก์ไม่ได้และโดน RLS
-- บล็อกตัวเอง (เข้าไปแก้ผ่าน Dashboard เองไม่ได้เพราะ RLS ใช้ current_employee_id())
-- =============================================================================

insert into employees (email, full_name, role, department_id, position, hire_date)
values (
  'arnon@irdp.org',
  'อานนท์ แย้มโชติ',
  'admin',
  (select id from departments where name = 'ธุรการ'),
  'IT / ผู้ดูแลระบบ',
  current_date            -- แก้เป็นวันเริ่มงานจริงของคุณ ถ้าไม่ใช่วันนี้ (มีผลต่อโควต้าพักร้อน)
)
on conflict (email) do update
  set role = 'admin',
      department_id = (select id from departments where name = 'ธุรการ');

-- ตรวจสอบ
select id, email, full_name, role, department_id, hire_date, status
from employees where email = 'arnon@irdp.org';
