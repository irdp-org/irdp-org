-- =============================================================================
-- IRDP — QMS Controlled Documents (ISO 9001:2026, §7.5.3)
--
-- Separate from org_documents on purpose: controlled documents need
-- versioning, supersession, a doc code, an owning department, and an
-- effective date that org_documents was never designed for. Files live in
-- Google Drive (the "IRDP_QMS_เอกสารเผยแพร่" folder, organized by department)
-- — same pattern as every other document feature in this app.
--
-- Access model: everyone reads *active* documents (read/download only,
-- enforced at the RLS layer, not just hidden in the UI); only a Document
-- Control Center (DCC) member can upload new versions. DCC membership is a
-- plain allowlist table, not a role_t value — keeps this independent of the
-- org-hierarchy role system so e.g. a future QMR can be added without
-- granting full admin, and doesn't touch any existing role-gated RLS policy.
-- =============================================================================

create type qms_doc_type_t as enum ('manual', 'procedure', 'work_instruction', 'form');
create type qms_doc_status_t as enum ('active', 'superseded', 'obsolete');

create table qms_document_controllers (
  employee_id uuid primary key references employees(id) on delete cascade,
  added_at    timestamptz not null default now()
);

create table qms_documents (
  id              uuid primary key default gen_random_uuid(),
  doc_code        text not null,
  title           text not null,
  doc_type        qms_doc_type_t not null,
  department_id   uuid not null references departments(id),
  version         text not null,
  status          qms_doc_status_t not null default 'active',
  effective_date  date not null,
  superseded_by   uuid references qms_documents(id),
  google_file_id  text not null,
  google_view_url text not null,
  file_size_bytes bigint,
  uploaded_by     uuid not null references employees(id),
  created_at      timestamptz not null default now()
);

-- Only one active version per doc_code at a time.
create unique index qms_doc_one_active on qms_documents (doc_code) where status = 'active';
create index qms_doc_code_idx on qms_documents (doc_code);
create index qms_doc_dept_idx on qms_documents (department_id);

create or replace function is_dcc() returns boolean language sql stable as $$
  select is_admin() or exists (
    select 1 from qms_document_controllers where employee_id = current_employee_id()
  )
$$;

alter table qms_document_controllers enable row level security;
alter table qms_documents enable row level security;

-- Only DCC/admin need to know who else is DCC.
create policy qmsctrl_select on qms_document_controllers for select to authenticated
  using (is_dcc());
create policy qmsctrl_write on qms_document_controllers for all to authenticated
  using (is_admin()) with check (is_admin());

-- Everyone reads active documents; DCC also sees superseded/obsolete (history).
create policy qmsdoc_select on qms_documents for select to authenticated
  using (status = 'active' or is_dcc());
create policy qmsdoc_write on qms_documents for all to authenticated
  using (is_dcc()) with check (is_dcc());
