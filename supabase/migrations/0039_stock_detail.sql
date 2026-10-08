-- =============================================================================
-- IRDP — รายละเอียดการเคลื่อนไหวสต๊อค: นำเข้า (ซื้อ) / ตัด (เบิก) / คืน
-- =============================================================================

alter table stock_transactions add column if not exists kind text not null default 'adjust'
  check (kind in ('purchase', 'deduct', 'return', 'adjust'));
alter table stock_transactions add column if not exists total_price numeric;
alter table stock_transactions add column if not exists vendor text;
alter table stock_transactions add column if not exists purchase_date date;
alter table stock_transactions add column if not exists project text;

-- Backfill a reasonable kind for existing rows (sign-based guess) so
-- reports/filters aren't all "adjust".
update stock_transactions set kind = case when delta > 0 then 'purchase' else 'deduct' end
  where kind = 'adjust';

-- Replace fn_adjust_stock with the fuller signature. Drop first — a bare
-- "create or replace" with added params creates a second overload instead
-- of replacing (see 0037's fix for the exact same mistake), so always drop
-- the old signature(s) first when growing a function's parameter list.
drop function if exists fn_adjust_stock(uuid, int, uuid, text);

create or replace function fn_adjust_stock(
  p_item_id uuid,
  p_delta int,
  p_employee_id uuid,
  p_note text,
  p_kind text default 'adjust',
  p_total_price numeric default null,
  p_vendor text default null,
  p_purchase_date date default null,
  p_project text default null
)
returns int
language plpgsql security definer set search_path = public as $$
declare v_new int;
begin
  if not fn_can_use_stock() or p_employee_id <> current_employee_id() then
    raise exception 'ไม่มีสิทธิ์';
  end if;
  if p_kind not in ('purchase', 'deduct', 'return', 'adjust') then
    raise exception 'ประเภทรายการไม่ถูกต้อง';
  end if;

  update stock_items
    set quantity_on_hand = quantity_on_hand + p_delta, updated_at = now()
    where id = p_item_id
    returning quantity_on_hand into v_new;

  if v_new is null then
    raise exception 'ไม่พบรายการสต๊อค';
  end if;

  insert into stock_transactions (item_id, employee_id, delta, remaining_after, note, kind, total_price, vendor, purchase_date, project)
    values (p_item_id, p_employee_id, p_delta, v_new, p_note, p_kind, p_total_price, p_vendor, p_purchase_date, p_project);

  return v_new;
end $$;
