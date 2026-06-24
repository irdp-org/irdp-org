-- =============================================================================
-- IRDP — 0009 : org_documents + org-docs storage bucket
-- รันหลัง 0008. ไม่แก้ไฟล์เดิม — เพิ่มเติมเท่านั้น.
--
-- สิ่งที่ทำ:
--   1) Bucket org-docs (private) สำหรับเอกสารองค์กร
--   2) ตาราง org_documents — catalog ไฟล์พร้อม category
--   3) RLS: ทุกคน (authenticated) อ่านได้ / admin+hr เขียน/ลบได้
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Storage bucket
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('org-docs', 'org-docs', false, 52428800,
     array['application/pdf','image/jpeg','image/png','image/webp',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
           'application/msword'])
on conflict (id) do nothing;

-- org-docs: ทุก authenticated อ่าน; admin/hr เขียน/แก้/ลบ
create policy orgdoc_select on storage.objects for select to authenticated
  using ( bucket_id = 'org-docs' );

create policy orgdoc_insert on storage.objects for insert to authenticated
  with check ( bucket_id = 'org-docs' and public.can_edit() );

create policy orgdoc_update on storage.objects for update to authenticated
  using  ( bucket_id = 'org-docs' and public.can_edit() )
  with check ( bucket_id = 'org-docs' and public.can_edit() );

create policy orgdoc_delete on storage.objects for delete to authenticated
  using ( bucket_id = 'org-docs' and public.can_edit() );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) ตาราง org_documents
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists org_documents (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  category      text not null default 'other'
                  check (category in (
                    'regulation',   -- ระเบียบ
                    'directive',    -- คำสั่ง
                    'announcement', -- ประกาศ
                    'founding',     -- เอกสารจัดตั้ง
                    'tax',          -- ภาษี/เลขประจำตัว
                    'consultant',   -- ที่ปรึกษาไทย
                    'other'
                  )),
  storage_path  text not null,          -- path ใน org-docs bucket
  file_size_bytes bigint,
  sort_order    int not null default 0, -- เรียงลำดับในหมวดเดียวกัน
  uploaded_by   uuid references employees(id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table org_documents enable row level security;

-- RLS: ทุกคน (authenticated) อ่าน
create policy orgdoc_row_select on org_documents for select to authenticated
  using (true);

-- admin/hr สร้าง
create policy orgdoc_row_insert on org_documents for insert to authenticated
  with check ( public.can_edit() );

-- admin/hr แก้ไข
create policy orgdoc_row_update on org_documents for update to authenticated
  using ( public.can_edit() )
  with check ( public.can_edit() );

-- admin/hr ลบ
create policy orgdoc_row_delete on org_documents for delete to authenticated
  using ( public.can_edit() );
