-- =============================================================================
-- IRDP — fix: activity_checkins had no UPDATE policy at all
--
-- 0034 added select/insert policies for activity_checkins but never an
-- update policy. With RLS enabled and no matching policy, every UPDATE
-- (including checkOutActivity's own-row `checked_out_at` write) silently
-- matched zero rows instead of erroring — so no one has ever actually been
-- able to check out of a training activity through the app. The action's
-- "0 rows matched" fallback then mistook this for "already checked out"
-- and showed a misleading message instead of the real cause.
-- =============================================================================

drop policy if exists actcheckin_update on activity_checkins;

create policy actcheckin_update on activity_checkins for update to authenticated
  using (employee_id = current_employee_id() or is_oversight())
  with check (employee_id = current_employee_id() or is_oversight());
