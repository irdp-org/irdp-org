-- =============================================================================
-- IRDP — จัดการสต๊อคของใช้สำหรับฝ่ายฝึกอบรม วิจัยและพัฒนา และ บัญชี (ธุรการ)
-- =============================================================================

create table if not exists stock_items (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  unit              text,
  quantity_on_hand  int not null default 0 check (quantity_on_hand >= 0),
  created_by        uuid references employees(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists stock_transactions (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references stock_items(id) on delete cascade,
  employee_id     uuid not null references employees(id),
  delta           int not null,              -- +นำเข้า / -ตัดออก
  remaining_after int not null,
  note            text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_stock_tx_item on stock_transactions(item_id, created_at desc);

-- Access: admin/hr, or employees in ฝึกอบรม/วิจัยและพัฒนา/ธุรการ (บัญชีอยู่ในธุรการ)
create or replace function fn_can_use_stock() returns boolean
language sql security definer set search_path = public stable as $$
  select is_admin() or is_oversight()
    or exists (
      select 1 from employees e join departments d on d.id = e.department_id
      where e.id = current_employee_id() and d.name in ('ฝึกอบรม', 'วิจัยและพัฒนา', 'ธุรการ')
    )
$$;

-- Atomic adjust (avoids lost-update races on concurrent deductions)
create or replace function fn_adjust_stock(p_item_id uuid, p_delta int, p_employee_id uuid, p_note text)
returns int
language plpgsql security definer set search_path = public as $$
declare v_new int;
begin
  if not fn_can_use_stock() or p_employee_id <> current_employee_id() then
    raise exception 'ไม่มีสิทธิ์';
  end if;

  update stock_items
    set quantity_on_hand = quantity_on_hand + p_delta, updated_at = now()
    where id = p_item_id
    returning quantity_on_hand into v_new;

  if v_new is null then
    raise exception 'ไม่พบรายการสต๊อค';
  end if;

  insert into stock_transactions (item_id, employee_id, delta, remaining_after, note)
    values (p_item_id, p_employee_id, p_delta, v_new, p_note);

  return v_new;
end $$;

alter table stock_items enable row level security;
alter table stock_transactions enable row level security;

drop policy if exists stockitem_select on stock_items;
drop policy if exists stockitem_insert on stock_items;
drop policy if exists stockitem_update on stock_items;
create policy stockitem_select on stock_items for select to authenticated using (fn_can_use_stock());
create policy stockitem_insert on stock_items for insert to authenticated with check (fn_can_use_stock());
create policy stockitem_update on stock_items for update to authenticated using (fn_can_use_stock());

drop policy if exists stocktx_select on stock_transactions;
drop policy if exists stocktx_insert on stock_transactions;
create policy stocktx_select on stock_transactions for select to authenticated using (fn_can_use_stock());
create policy stocktx_insert on stock_transactions for insert to authenticated
  with check (fn_can_use_stock() and employee_id = current_employee_id());
