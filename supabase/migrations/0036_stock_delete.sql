-- =============================================================================
-- IRDP — อนุญาตให้ admin ลบรายการสต๊อคได้ (เช่น รายการที่สร้างไว้ทดสอบ)
-- =============================================================================

drop policy if exists stockitem_delete on stock_items;
create policy stockitem_delete on stock_items for delete to authenticated using (is_admin());
