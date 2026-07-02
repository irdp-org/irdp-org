-- Booking add-ons:
--  Van (item 7): checkboxes for tollway / fuel / other expenses
--  Room (item 8): equipment used in the meeting (visible to everyone)

alter table van_bookings
  add column if not exists has_tollway   boolean not null default false,
  add column if not exists has_fuel      boolean not null default false,
  add column if not exists other_expense text;

alter table room_bookings
  add column if not exists equipment text[] not null default '{}';
