-- Prep for importing the real IRDP employee roster.

-- 1) Employee code (รหัสพนักงาน) — e.g. "001/2555", "C019/2569"
alter table employees add column if not exists employee_code text;

-- 2) Reconcile department names with the real org chart.
--    Renames keep the existing UUIDs (and any FK references) intact.
update departments set name = 'ประเมินผล'    where name = 'ประเมิน';
update departments set name = 'วิจัยและพัฒนา' where name = 'วิจัย';
update departments set name = 'ฝึกอบรม'       where name = 'อบรม';

insert into departments (name) values
  ('ผู้บริหาร'),
  ('สำนักกรรมการผู้จัดการ')
on conflict (name) do nothing;
