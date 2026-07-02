-- Document intake / ลงรับเอกสาร (item 2)
-- The receiving clerk photographs the envelope; the image is stored in Google
-- Drive, OCR (Gemini) prefills ผู้รับ/ผู้ส่ง, a running number is assigned, and
-- the matched recipient employee is notified.

create table received_documents (
  id                 uuid primary key default gen_random_uuid(),
  doc_no             text not null,               -- running no., e.g. "2568/0001"
  year_be            int not null,                -- Buddhist year of the running no.
  seq                int not null,                -- sequence within the year
  recipient_name     text,                        -- as read/entered
  recipient_emp_id   uuid references employees(id),
  sender             text,
  subject            text,
  image_drive_id     text,
  image_url          text,
  received_by        uuid references employees(id),
  received_at        timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  unique (year_be, seq)
);

create index received_docs_recipient_idx on received_documents(recipient_emp_id);
create index received_docs_year_idx on received_documents(year_be);

-- Atomically pick the next sequence for a Buddhist year (avoids race on doc_no)
create or replace function fn_next_doc_seq(p_year int) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select coalesce(max(seq), 0) + 1 into n from received_documents where year_be = p_year;
  return n;
end $$;

alter table received_documents enable row level security;

-- Visible to: the receiving clerks (oversight/admin/hr) and the recipient
create policy recvdoc_select on received_documents for select to authenticated
  using (is_oversight() or received_by = current_employee_id() or recipient_emp_id = current_employee_id());
create policy recvdoc_insert on received_documents for insert to authenticated
  with check (received_by = current_employee_id());
create policy recvdoc_update on received_documents for update to authenticated
  using (is_oversight() or received_by = current_employee_id());
create policy recvdoc_delete on received_documents for delete to authenticated
  using (is_admin());
