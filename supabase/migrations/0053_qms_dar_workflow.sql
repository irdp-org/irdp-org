-- =============================================================================
-- IRDP — QMS DAR (ใบคำขอดำเนินการเอกสาร) approval workflow
-- (ISO 9001:2026, PM-DCC-01 กิจกรรมที่ 1–7 / FM-DCC-01-02 / FM-DCC-01-03 /
--  SD-DCC-01-01)
--
-- Builds on qms_documents (0045) instead of replacing it: a DAR is the
-- multi-step approval record; once every step signs off, DCC publishes it
-- and a qms_documents row is created/superseded exactly as before.
--
-- The sign-off chain (author -> reviewer -> approver -> DCC check -> QMR) is
-- stored as a single jsonb array on the DAR row rather than a child table —
-- it's always read/written as one unit (one step acts, the whole row
-- re-saves), which matches how employees.education/work_history already do
-- it in this schema. Authorization for "is it your turn" is enforced in the
-- server action (see app/(app)/qms/dar/actions.ts), the same pattern this
-- app already uses for the document-intake permission checks — RLS here
-- only gates *who can see or touch the row at all*, not turn order.
-- =============================================================================

-- Authority matrix (SD-DCC-01-01) — which POSITION TITLE must sign at each
-- step for a given (process_code, doc_type_code). DCC uses this to filter/
-- suggest employees; it is not a hard auto-assign, since employees.position
-- is free text and can't be guaranteed to match this table's wording. DCC
-- reviews this table at least once a year per PM-DCC-01 §3.3(1).
create table qms_authority_matrix (
  id                 uuid primary key default gen_random_uuid(),
  process_code       text not null,            -- PA, RD, TR, SALE, HR, ADM, FIN, IT, MGT, QMS, DCC
  process_label      text not null,             -- ฝ่าย/กระบวนการ ภาษาไทย
  doc_type_code      text not null check (doc_type_code in ('QM','PM','WI','FM','SD')),
  author_position    text not null,
  reviewer_position  text not null,
  approver_position  text not null,
  updated_at         timestamptz not null default now(),
  unique (process_code, doc_type_code)
);

alter table qms_authority_matrix enable row level security;
create policy qms_matrix_select on qms_authority_matrix for select to authenticated using (true);
create policy qms_matrix_write on qms_authority_matrix for all to authenticated
  using (is_admin() or is_dcc()) with check (is_admin() or is_dcc());

-- QMR allowlist — same shape as qms_document_controllers (0045). Kept
-- independent of role_t for the same reason DCC is: a QMR designation
-- shouldn't require granting the broader admin role.
create table qms_qmr (
  employee_id uuid primary key references employees(id) on delete cascade,
  added_at    timestamptz not null default now()
);

create or replace function is_qmr() returns boolean language sql stable as $$
  select is_admin() or exists (select 1 from qms_qmr where employee_id = current_employee_id())
$$;

alter table qms_qmr enable row level security;
create policy qms_qmr_select on qms_qmr for select to authenticated using (is_dcc() or is_qmr());
create policy qms_qmr_write on qms_qmr for all to authenticated using (is_admin()) with check (is_admin());

-- The DAR itself.
create table qms_dar (
  id                     uuid primary key default gen_random_uuid(),
  dar_no                 text,                  -- assigned only once every step approves
  action_type            text not null check (action_type in ('create','revise','cancel')),
  doc_code               text not null,
  title                  text not null,
  doc_type_code          text not null check (doc_type_code in ('QM','PM','WI','FM','SD')),
  process_code           text not null,
  department_id          uuid references departments(id),
  reason                 text,
  change_summary         text,
  confidentiality        text not null default 'internal' check (confidentiality in ('public','internal','confidential')),
  qmr_waived             boolean not null default false,
  qmr_waived_by          uuid references employees(id),
  qmr_waived_at          timestamptz,

  -- Unsigned file DCC uploaded, before the chain runs.
  source_google_file_id  text,
  source_google_view_url text,
  source_file_size       bigint,
  effective_date         date,

  -- For revise/cancel: which published document this replaces.
  target_document_id     uuid references qms_documents(id),
  -- Filled in once DCC publishes after full approval.
  resulting_document_id  uuid references qms_documents(id),

  status                 text not null default 'pending'
                           check (status in ('pending','approved','returned','cancelled')),
  current_step           int not null default 0,
  -- [{ role, employee_id, full_name_snapshot, position_snapshot, status,
  --    acted_at, note, signature_url_snapshot }]
  -- role ∈ author | reviewer | approver | dcc | qmr
  -- status ∈ waiting | current | approved | rejected
  steps                  jsonb not null default '[]'::jsonb,

  dcc_check_note         text,
  qmr_decision           text check (qmr_decision in ('approve','meeting','other')),
  qmr_note               text,

  created_by             uuid not null references employees(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index qms_dar_doc_code_idx on qms_dar (doc_code);
create index qms_dar_status_idx on qms_dar (status);
create index qms_dar_created_by_idx on qms_dar (created_by);

alter table qms_dar enable row level security;

-- Visible to: its creator (DCC), any DCC/QMR member, or any employee named
-- as a step in the chain (so e.g. a dept head who hasn't acted yet can still
-- open it and see what's pending).
create policy qms_dar_select on qms_dar for select to authenticated
  using (
    is_dcc() or is_qmr() or created_by = current_employee_id()
    or exists (
      select 1 from jsonb_array_elements(steps) s
      where (s->>'employee_id')::uuid = current_employee_id()
    )
  );

create policy qms_dar_insert on qms_dar for insert to authenticated with check (is_dcc());

-- Updates (acting on a step, DCC publishing, etc.) are allowed for DCC/QMR
-- or whoever is named in the chain — the server action is the one that
-- actually checks it's THEIR turn before allowing an approve/reject.
create policy qms_dar_update on qms_dar for update to authenticated
  using (
    is_dcc() or is_qmr()
    or exists (
      select 1 from jsonb_array_elements(steps) s
      where (s->>'employee_id')::uuid = current_employee_id()
    )
  );

-- qms_documents (0045) gains the fields a published-from-DAR row needs.
-- doc_type_code is kept separate from the existing doc_type enum rather
-- than altering that enum (adding an enum value can't be used in the same
-- transaction it's added in, and nothing here needs the old enum changed).
alter table qms_documents add column if not exists doc_type_code text check (doc_type_code in ('QM','PM','WI','FM','SD'));
alter table qms_documents add column if not exists process_code text;
alter table qms_documents add column if not exists confidentiality text default 'internal' check (confidentiality in ('public','internal','confidential'));
alter table qms_documents add column if not exists dar_id uuid references qms_dar(id);

-- =============================================================================
-- Seed: SD-DCC-01-01 ตารางกำหนดสิทธิ์ในการทบทวนและอนุมัติเอกสารระบบบริหารคุณภาพ
-- =============================================================================
insert into qms_authority_matrix (process_code, process_label, doc_type_code, author_position, reviewer_position, approver_position) values
  ('PA',   'ประเมินผล',      'PM', 'ผู้ช่วยผู้จัดการขึ้นไปหรือผู้ที่ได้รับมอบหมาย', 'ผู้อำนวยการฝ่าย', 'รองกรรมการผู้จัดการ'),
  ('PA',   'ประเมินผล',      'WI', 'ผู้ช่วยผู้จัดการขึ้นไปหรือผู้ที่ได้รับมอบหมาย', 'ผู้อำนวยการฝ่าย', 'รองกรรมการผู้จัดการ'),
  ('PA',   'ประเมินผล',      'FM', 'ผู้ช่วยผู้จัดการขึ้นไปหรือผู้ที่ได้รับมอบหมาย', 'ผู้อำนวยการฝ่าย', 'รองกรรมการผู้จัดการ'),
  ('PA',   'ประเมินผล',      'SD', 'ผู้ช่วยผู้จัดการขึ้นไปหรือผู้ที่ได้รับมอบหมาย', 'ผู้อำนวยการฝ่าย', 'รองกรรมการผู้จัดการ'),

  ('RD',   'วิจัย',          'PM', 'นักวิจัยอาวุโสหรือผู้ที่ได้รับมอบหมาย', 'รองผู้จัดการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('RD',   'วิจัย',          'WI', 'นักวิจัยอาวุโสหรือผู้ที่ได้รับมอบหมาย', 'รองผู้จัดการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('RD',   'วิจัย',          'FM', 'นักวิจัยอาวุโสหรือผู้ที่ได้รับมอบหมาย', 'รองผู้จัดการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('RD',   'วิจัย',          'SD', 'นักวิจัยอาวุโสหรือผู้ที่ได้รับมอบหมาย', 'รองผู้จัดการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),

  ('TR',   'ฝึกอบรม',        'PM', 'ผู้ชำนาญการฝึกอบรมขึ้นไปหรือผู้ที่ได้รับมอบหมาย', 'ผู้จัดการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('TR',   'ฝึกอบรม',        'WI', 'ผู้ชำนาญการฝึกอบรมขึ้นไปหรือผู้ที่ได้รับมอบหมาย', 'ผู้จัดการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('TR',   'ฝึกอบรม',        'FM', 'ผู้ชำนาญการฝึกอบรมขึ้นไปหรือผู้ที่ได้รับมอบหมาย', 'ผู้จัดการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('TR',   'ฝึกอบรม',        'SD', 'ผู้ชำนาญการฝึกอบรมขึ้นไปหรือผู้ที่ได้รับมอบหมาย', 'ผู้จัดการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),

  ('SALE', 'ขาย',            'PM', 'ผู้ชำนาญการฝึกอบรมขึ้นไปหรือผู้ที่ได้รับมอบหมาย', 'ผู้จัดการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('SALE', 'ขาย',            'WI', 'ผู้ชำนาญการฝึกอบรมขึ้นไปหรือผู้ที่ได้รับมอบหมาย', 'ผู้จัดการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('SALE', 'ขาย',            'FM', 'ผู้ชำนาญการฝึกอบรมขึ้นไปหรือผู้ที่ได้รับมอบหมาย', 'ผู้จัดการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('SALE', 'ขาย',            'SD', 'ผู้ชำนาญการฝึกอบรมขึ้นไปหรือผู้ที่ได้รับมอบหมาย', 'ผู้จัดการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),

  ('HR',   'ธุรการ_ส่วนงานบุคคล', 'PM', 'ผู้ชำนาญการธุรการขึ้นไปหรือผู้ที่ได้รับมอบหมาย', 'ผู้อำนวยการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('HR',   'ธุรการ_ส่วนงานบุคคล', 'WI', 'ผู้ชำนาญการธุรการขึ้นไปหรือผู้ที่ได้รับมอบหมาย', 'ผู้อำนวยการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('HR',   'ธุรการ_ส่วนงานบุคคล', 'FM', 'ผู้ชำนาญการธุรการขึ้นไปหรือผู้ที่ได้รับมอบหมาย', 'ผู้อำนวยการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('HR',   'ธุรการ_ส่วนงานบุคคล', 'SD', 'ผู้ชำนาญการธุรการขึ้นไปหรือผู้ที่ได้รับมอบหมาย', 'ผู้อำนวยการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),

  ('ADM',  'ธุรการ_จัดซื้อ',  'PM', 'ผู้ชำนาญการธุรการขึ้นไปหรือผู้ที่ได้รับมอบหมาย', 'ผู้อำนวยการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('ADM',  'ธุรการ_จัดซื้อ',  'WI', 'ผู้ชำนาญการธุรการขึ้นไปหรือผู้ที่ได้รับมอบหมาย', 'ผู้อำนวยการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('ADM',  'ธุรการ_จัดซื้อ',  'FM', 'ผู้ชำนาญการธุรการขึ้นไปหรือผู้ที่ได้รับมอบหมาย', 'ผู้อำนวยการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('ADM',  'ธุรการ_จัดซื้อ',  'SD', 'ผู้ชำนาญการธุรการขึ้นไปหรือผู้ที่ได้รับมอบหมาย', 'ผู้อำนวยการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),

  ('FIN',  'ธุรการ_บัญชีการเงิน', 'PM', 'นักบัญชีอาวุโสหรือผู้ที่ได้รับมอบหมาย', 'ผู้อำนวยการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('FIN',  'ธุรการ_บัญชีการเงิน', 'WI', 'นักบัญชีอาวุโสหรือผู้ที่ได้รับมอบหมาย', 'ผู้อำนวยการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('FIN',  'ธุรการ_บัญชีการเงิน', 'FM', 'นักบัญชีอาวุโสหรือผู้ที่ได้รับมอบหมาย', 'ผู้อำนวยการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('FIN',  'ธุรการ_บัญชีการเงิน', 'SD', 'นักบัญชีอาวุโสหรือผู้ที่ได้รับมอบหมาย', 'ผู้อำนวยการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),

  ('IT',   'ธุรการ_IT',      'PM', 'รองผู้จัดการหรือผู้ที่ได้รับมอบหมาย', 'ผู้อำนวยการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('IT',   'ธุรการ_IT',      'WI', 'รองผู้จัดการหรือผู้ที่ได้รับมอบหมาย', 'ผู้อำนวยการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('IT',   'ธุรการ_IT',      'FM', 'รองผู้จัดการหรือผู้ที่ได้รับมอบหมาย', 'ผู้อำนวยการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),
  ('IT',   'ธุรการ_IT',      'SD', 'รองผู้จัดการหรือผู้ที่ได้รับมอบหมาย', 'ผู้อำนวยการฝ่าย', 'รองกรรมการผู้จัดการอาวุโส'),

  ('MGT',  'ระบบกลาง ISO_บริหาร', 'QM', 'ผู้ช่วย QMR', 'QMR', 'กรรมการผู้จัดการ'),
  ('MGT',  'ระบบกลาง ISO_บริหาร', 'SD', 'ผู้ช่วย QMR', 'QMR', 'กรรมการผู้จัดการ'),

  ('QMS',  'ระบบกลาง ISO_QMS', 'PM', 'ผู้ช่วย QMR', 'ผู้ช่วย QMR', 'QMR'),
  ('QMS',  'ระบบกลาง ISO_QMS', 'WI', 'ผู้ช่วย QMR', 'ผู้ช่วย QMR', 'QMR'),
  ('QMS',  'ระบบกลาง ISO_QMS', 'FM', 'ผู้ช่วย QMR', 'ผู้ช่วย QMR', 'QMR'),
  ('QMS',  'ระบบกลาง ISO_QMS', 'SD', 'ผู้ช่วย QMR', 'ผู้ช่วย QMR', 'QMR'),

  ('DCC',  'ระบบกลาง ISO_DCC', 'PM', 'เจ้าหน้าที่ DCC', 'ผู้ช่วย QMR', 'QMR'),
  ('DCC',  'ระบบกลาง ISO_DCC', 'WI', 'เจ้าหน้าที่ DCC', 'ผู้ช่วย QMR', 'QMR'),
  ('DCC',  'ระบบกลาง ISO_DCC', 'FM', 'เจ้าหน้าที่ DCC', 'ผู้ช่วย QMR', 'QMR'),
  ('DCC',  'ระบบกลาง ISO_DCC', 'SD', 'เจ้าหน้าที่ DCC', 'ผู้ช่วย QMR', 'QMR');
