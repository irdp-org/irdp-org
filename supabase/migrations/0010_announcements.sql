-- =============================================================================
-- IRDP — 0010 : announcements + announcement_comments
-- รันหลัง 0009. ไม่แก้ไฟล์เดิม — เพิ่มเติมเท่านั้น.
--
-- สิ่งที่ทำ:
--   1) ตาราง announcements — ข่าวสาร/ประกาศ/กิจกรรม โดย admin/hr
--   2) ตาราง announcement_comments — ความคิดเห็นของพนักงาน
--   3) RLS สำหรับทั้งสองตาราง
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) announcements
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  cover_url    text,               -- optional cover image (org-docs bucket หรือ public URL)
  category     text not null default 'news'
                 check (category in (
                   'news',         -- ข่าวสาร
                   'event',        -- กิจกรรม
                   'announcement', -- ประกาศ
                   'activity'      -- ประชาสัมพันธ์
                 )),
  is_published boolean not null default false,
  notify_push  boolean not null default false, -- ส่ง push notification เมื่อ publish
  created_by   uuid references employees(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table announcements enable row level security;

-- ทุกคน (authenticated) อ่าน published
create policy ann_select on announcements for select to authenticated
  using ( is_published = true or public.can_edit() );

-- admin/hr สร้าง
create policy ann_insert on announcements for insert to authenticated
  with check ( public.can_edit() );

-- admin/hr แก้ไข
create policy ann_update on announcements for update to authenticated
  using ( public.can_edit() )
  with check ( public.can_edit() );

-- admin/hr ลบ
create policy ann_delete on announcements for delete to authenticated
  using ( public.can_edit() );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) announcement_comments
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists announcement_comments (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references announcements(id) on delete cascade,
  employee_id     uuid not null references employees(id) on delete cascade,
  body            text not null,
  created_at      timestamptz not null default now()
);

alter table announcement_comments enable row level security;

create index if not exists idx_ann_comments_ann on announcement_comments(announcement_id);

-- ทุกคน (authenticated) อ่าน comment ของ published announcement
create policy ann_cmt_select on announcement_comments for select to authenticated
  using (
    exists (
      select 1 from announcements a
      where a.id = announcement_id and (a.is_published = true or public.can_edit())
    )
  );

-- ทุกคน (authenticated) comment ได้ (เฉพาะของตัวเอง)
create policy ann_cmt_insert on announcement_comments for insert to authenticated
  with check ( employee_id = public.current_employee_id() );

-- ลบ: เจ้าของ comment หรือ admin/hr
create policy ann_cmt_delete on announcement_comments for delete to authenticated
  using ( employee_id = public.current_employee_id() or public.can_edit() );
