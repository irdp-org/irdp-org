-- Training batches (รุ่น) — a course can have many batches

create table training_batches (
  id             uuid        primary key default gen_random_uuid(),
  course_id      uuid        not null references training_courses(id) on delete cascade,
  batch_no       int,
  training_dates text,
  location       text,
  note           text,
  created_at     timestamptz default now()
);

create index training_batches_course_idx on training_batches(course_id);

-- Link participants to a batch (in addition to the course)
alter table training_participants
  add column batch_id uuid references training_batches(id) on delete cascade;

create index training_participants_batch_idx on training_participants(batch_id);

alter table training_batches enable row level security;

create policy "training_batches_select" on training_batches
  for select to authenticated using (true);
