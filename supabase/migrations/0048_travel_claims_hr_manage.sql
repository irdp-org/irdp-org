-- admin/hr need to edit or delete a travel expense claim regardless of its
-- status (e.g. cleaning up a test claim someone already approved) — the
-- previous policies only let hr/admin/exec UPDATE ('is_oversight'), and only
-- 'is_admin' (not hr) DELETE, and only when the claim was still 'draft'.
-- can_edit() = hr or admin, same convention already used for other requests
-- ("hr cannot approve, but hr/admin can edit directly" — see 0001_init).

drop policy if exists travel_update on travel_expense_claims;
create policy travel_update on travel_expense_claims for update to authenticated
  using (
     (employee_id = current_employee_id() and status in ('draft','returned','submitted'))
     or can_edit()
     or is_oversight()
     or exists (select 1 from employees e where e.id = travel_expense_claims.employee_id and is_head_of(e.department_id))
  );

drop policy if exists travel_delete on travel_expense_claims;
create policy travel_delete on travel_expense_claims for delete to authenticated
  using (can_edit() or (employee_id = current_employee_id() and status = 'draft'));

drop policy if exists travel_items_write on travel_expense_items;
create policy travel_items_write on travel_expense_items for all to authenticated
  using (exists (select 1 from travel_expense_claims c where c.id = claim_id
                 and (c.employee_id = current_employee_id() or can_edit())))
  with check (exists (select 1 from travel_expense_claims c where c.id = claim_id
                 and (c.employee_id = current_employee_id() or can_edit())));
