-- Training Management System tables

create table training_courses (
  id           uuid        primary key default gen_random_uuid(),
  name_th      text        not null,
  name_en      text,
  open_date    date,
  close_date   date,
  location     text,
  training_dates text,            -- free-text description of dates
  description  text,
  target_group text,
  objectives   text,
  logo_url     text,
  created_by   uuid        references employees(id) on delete set null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create table training_participants (
  id          uuid        primary key default gen_random_uuid(),
  course_id   uuid        not null references training_courses(id) on delete cascade,
  first_name  text        not null,
  last_name   text        not null,
  position    text,
  organization text,
  phone       text,
  email       text,
  note        text,
  created_at  timestamptz default now()
);

create index training_participants_course_idx on training_participants(course_id);

-- RLS: only the service role (admin client) writes; employees read via service role too
alter table training_courses     enable row level security;
alter table training_participants enable row level security;

-- Allow authenticated users to read (we guard at app layer for write)
create policy "training_courses_select" on training_courses
  for select to authenticated using (true);

create policy "training_participants_select" on training_participants
  for select to authenticated using (true);
