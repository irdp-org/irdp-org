-- Travel expense reimbursement (item 4)
-- One claim (เอกสารเบิกค่าเดินทาง) has many legs across many days.
-- Private car: km * 6 THB. Other modes (rถเมล์/รถไฟฟ้า/grab/แอปอื่น): amount entered.

create table travel_expense_claims (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  title        text,
  status       request_status_t not null default 'draft',
  approver_id  uuid references employees(id),
  decided_at   timestamptz,
  total_amount numeric not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table travel_expense_items (
  id            uuid primary key default gen_random_uuid(),
  claim_id      uuid not null references travel_expense_claims(id) on delete cascade,
  travel_date   date not null,
  from_location text,
  to_location   text,
  mode          text not null,          -- bus | transit | grab | app | private_car | other
  km            numeric,                -- for private_car
  amount        numeric not null default 0,
  note          text,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create index travel_items_claim_idx on travel_expense_items(claim_id);
create index travel_claims_emp_idx on travel_expense_claims(employee_id);

-- Keep claim.total_amount in sync with its items
create or replace function fn_travel_recompute_total() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  cid := coalesce(new.claim_id, old.claim_id);
  update travel_expense_claims c
    set total_amount = coalesce((select sum(amount) from travel_expense_items where claim_id = cid), 0),
        updated_at = now()
    where c.id = cid;
  return null;
end $$;

drop trigger if exists trg_travel_total on travel_expense_items;
create trigger trg_travel_total after insert or update or delete on travel_expense_items
  for each row execute function fn_travel_recompute_total();

-- Reuse the shared approval/lock rules (table-agnostic, checks status column)
drop trigger if exists trg_rules_travel on travel_expense_claims;
create trigger trg_rules_travel before update on travel_expense_claims
  for each row execute function enforce_request_rules();

-- RLS
alter table travel_expense_claims enable row level security;
alter table travel_expense_items  enable row level security;

create policy travel_select on travel_expense_claims for select to authenticated
  using (employee_id = current_employee_id() or is_oversight()
         or exists (select 1 from employees e where e.id = travel_expense_claims.employee_id and is_head_of(e.department_id)));
create policy travel_insert on travel_expense_claims for insert to authenticated
  with check (employee_id = current_employee_id());
create policy travel_update on travel_expense_claims for update to authenticated
  using (
     (employee_id = current_employee_id() and status in ('draft','returned','submitted'))
     or is_oversight()
     or exists (select 1 from employees e where e.id = travel_expense_claims.employee_id and is_head_of(e.department_id))
  );
create policy travel_delete on travel_expense_claims for delete to authenticated
  using (is_admin() or (employee_id = current_employee_id() and status = 'draft'));

-- Items: gated through the parent claim's ownership
create policy travel_items_select on travel_expense_items for select to authenticated
  using (exists (select 1 from travel_expense_claims c where c.id = claim_id
                 and (c.employee_id = current_employee_id() or is_oversight()
                      or exists (select 1 from employees e where e.id = c.employee_id and is_head_of(e.department_id)))));
create policy travel_items_write on travel_expense_items for all to authenticated
  using (exists (select 1 from travel_expense_claims c where c.id = claim_id
                 and (c.employee_id = current_employee_id() or is_admin())))
  with check (exists (select 1 from travel_expense_claims c where c.id = claim_id
                 and (c.employee_id = current_employee_id() or is_admin())));
