-- =============================================================================
-- IRDP — 1) แอดมินลบรายการประวัติสต๊อคได้ (ย้อนยอดคงเหลือกลับให้ถูกต้องด้วย)
--         2) เช็คอิน/เช็คเอ้าท์กิจกรรมอบรม ตามช่วงเวลาที่กำหนดจริง
-- =============================================================================

-- 1) ลบรายการสต๊อค (เฉพาะแอดมิน) — ย้อนผล delta ออกจาก quantity_on_hand
drop policy if exists stocktx_delete on stock_transactions;
create policy stocktx_delete on stock_transactions for delete to authenticated using (is_admin());

create or replace function fn_delete_stock_transaction(p_tx_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_item_id uuid; v_delta int;
begin
  if not is_admin() then
    raise exception 'ไม่มีสิทธิ์';
  end if;

  select item_id, delta into v_item_id, v_delta from stock_transactions where id = p_tx_id;
  if v_item_id is null then
    raise exception 'ไม่พบรายการ';
  end if;

  update stock_items set quantity_on_hand = quantity_on_hand - v_delta, updated_at = now() where id = v_item_id;
  delete from stock_transactions where id = p_tx_id;
end $$;

-- 2) เช็คเอ้าท์กิจกรรม + รายละเอียดการอบรม (จัดโดย/วิทยากร)
alter table activity_checkins add column if not exists checked_out_at timestamptz;
alter table calendar_events add column if not exists organizer text;
alter table calendar_events add column if not exists instructor text;
