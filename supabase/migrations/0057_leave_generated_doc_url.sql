-- generateLeaveDoc created a brand-new Google Doc every single time it was
-- called (no cached doc url, unlike van_bookings/room_bookings/
-- travel_expense_claims per 0038) — clicking "ออกเอกสาร" again on the same
-- leave request just made a duplicate file in Drive instead of reopening the
-- one already made. Add the same generated_doc_url column so the action can
-- reuse it and just re-stamp signatures, matching the booking pattern.
alter table leave_requests add column if not exists generated_doc_url text;
