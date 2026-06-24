-- =============================================================================
-- IRDP — 0008 : asset_tag sequence + RLS scoping for dept_head + return_note
-- รันหลัง 0001-0007. ไม่แก้ไฟล์เดิม — เพิ่มเติมเท่านั้น.
--
-- สิ่งที่ทำ:
--   1) Sequence asset_tag_seq + fn_next_asset_tag() → 'IRDP-XXXX'
--   2) return_note text column บน asset_assignments
--   3) asset_select: dept_head → เห็นเฉพาะทรัพย์สินที่ถือโดยคนในฝ่ายตัวเอง
--   4) assign_select: dept_head → เห็นเฉพาะ assignment ของคนในฝ่ายตัวเอง
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Asset tag auto-generation
-- ─────────────────────────────────────────────────────────────────────────────
create sequence if not exists asset_tag_seq start 1;

create or replace function fn_next_asset_tag() returns text
language sql security definer set search_path = public as $$
  select 'IRDP-' || lpad(nextval('asset_tag_seq')::text, 4, '0')
$$;

grant execute on function fn_next_asset_tag() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Return note column
-- ─────────────────────────────────────────────────────────────────────────────
alter table asset_assignments add column if not exists return_note text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) asset_select: dept_head → only assets held by own-department employees
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists asset_select on assets;
create policy asset_select on assets for select to authenticated
  using (
    is_oversight()
    or (
      is_dept_head()
      and current_holder_id in (
        select id from employees where department_id = current_dept()
      )
    )
    or current_holder_id = current_employee_id()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) assign_select: dept_head → only assignments of own-department employees
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists assign_select on asset_assignments;
create policy assign_select on asset_assignments for select to authenticated
  using (
    employee_id = current_employee_id()
    or is_oversight()
    or (
      is_dept_head()
      and employee_id in (
        select id from employees where department_id = current_dept()
      )
    )
  );
