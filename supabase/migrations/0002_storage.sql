-- =============================================================================
-- IRDP — 0002 : Storage buckets + RLS policies
-- รันหลัง 0001_init.sql (ใช้ helper functions: current_employee_id / is_oversight / is_head_of / is_admin)
-- ทุก bucket = private (public=false) -> ในแอปดึงรูปด้วย createSignedUrl ฝั่ง server
-- โครง path: ใช้ "โฟลเดอร์แรก" เป็นตัวระบุเจ้าของ
--   avatars/{employee_id}/...        leave-certs/{employee_id}/...
--   checkin-photos/{employee_id}/... asset-docs/{asset_id}/...
-- =============================================================================

-- ---------- สร้าง buckets ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars','avatars',false, 5242880,
     array['image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('leave-certs','leave-certs',false, 10485760,
     array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']),
  ('checkin-photos','checkin-photos',false, 10485760,
     array['image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('asset-docs','asset-docs',false, 20971520,
     array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

-- helper: employee_id จากโฟลเดอร์แรกของ path
-- (storage.foldername(name))[1]  ->  text ของ uuid

-- =============================================================================
-- AVATARS : ทุกคน (authenticated) ดูได้ (directory) ; เจ้าของอัป/แก้/ลบของตัวเอง ; admin/hr จัดการได้
-- =============================================================================
create policy avatars_select on storage.objects for select to authenticated
  using ( bucket_id = 'avatars' );

create policy avatars_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and ( (storage.foldername(name))[1] = public.current_employee_id()::text
          or public.can_edit() )
  );

create policy avatars_update on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and ( (storage.foldername(name))[1] = public.current_employee_id()::text or public.can_edit() )
  )
  with check (
    bucket_id = 'avatars'
    and ( (storage.foldername(name))[1] = public.current_employee_id()::text or public.can_edit() )
  );

create policy avatars_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and ( (storage.foldername(name))[1] = public.current_employee_id()::text or public.can_edit() )
  );

-- =============================================================================
-- LEAVE-CERTS (ใบรับรองแพทย์ = อ่อนไหว)
--   read: เจ้าของ / hr-admin-exec / หัวหน้าฝ่ายเดียวกัน
--   write: เจ้าของ หรือ hr/admin
-- =============================================================================
create policy certs_select on storage.objects for select to authenticated
  using (
    bucket_id = 'leave-certs'
    and exists (
      select 1 from public.employees e
      where e.id::text = (storage.foldername(name))[1]
        and ( e.user_id = auth.uid() or public.is_oversight() or public.is_head_of(e.department_id) )
    )
  );

create policy certs_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'leave-certs'
    and ( (storage.foldername(name))[1] = public.current_employee_id()::text or public.can_edit() )
  );

create policy certs_update on storage.objects for update to authenticated
  using (
    bucket_id = 'leave-certs'
    and ( (storage.foldername(name))[1] = public.current_employee_id()::text or public.can_edit() )
  )
  with check (
    bucket_id = 'leave-certs'
    and ( (storage.foldername(name))[1] = public.current_employee_id()::text or public.can_edit() )
  );

create policy certs_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'leave-certs'
    and ( (storage.foldername(name))[1] = public.current_employee_id()::text or public.is_admin() )
  );

-- =============================================================================
-- CHECKIN-PHOTOS (เซลฟี่ + รูปหน้างาน = อ่อนไหว/มี GPS เกี่ยวข้อง)
--   read: เจ้าของ / hr-admin-exec / หัวหน้าฝ่ายเดียวกัน
--   write: เจ้าของ (อัปตอนเช็คอิน) ; แก้/ลบ: hr/admin
-- =============================================================================
create policy photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'checkin-photos'
    and exists (
      select 1 from public.employees e
      where e.id::text = (storage.foldername(name))[1]
        and ( e.user_id = auth.uid() or public.is_oversight() or public.is_head_of(e.department_id) )
    )
  );

create policy photos_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'checkin-photos'
    and (storage.foldername(name))[1] = public.current_employee_id()::text
  );

create policy photos_update on storage.objects for update to authenticated
  using ( bucket_id = 'checkin-photos' and public.can_edit() )
  with check ( bucket_id = 'checkin-photos' and public.can_edit() );

create policy photos_delete on storage.objects for delete to authenticated
  using ( bucket_id = 'checkin-photos' and public.can_edit() );

-- =============================================================================
-- ASSET-DOCS (ใบเสร็จ/ใบกำกับ/เอกสารทรัพย์สิน)
--   read: hr/admin/exec/หัวหน้าฝ่าย ; write: admin (IT) เท่านั้น
-- =============================================================================
create policy assetdoc_select on storage.objects for select to authenticated
  using (
    bucket_id = 'asset-docs'
    and ( public.is_oversight() or public.is_dept_head() )
  );

create policy assetdoc_write on storage.objects for insert to authenticated
  with check ( bucket_id = 'asset-docs' and public.is_admin() );

create policy assetdoc_update on storage.objects for update to authenticated
  using ( bucket_id = 'asset-docs' and public.is_admin() )
  with check ( bucket_id = 'asset-docs' and public.is_admin() );

create policy assetdoc_delete on storage.objects for delete to authenticated
  using ( bucket_id = 'asset-docs' and public.is_admin() );

-- =============================================================================
-- หมายเหตุการใช้งานฝั่งแอป:
--  • ทุก bucket private -> แสดงรูปด้วย supabase.storage.from(bucket).createSignedUrl(path, ttl) ฝั่ง server
--  • อัปโหลดตั้งชื่อ path ให้ขึ้นต้นด้วย employee_id หรือ asset_id เสมอ เช่น
--      checkin-photos/{employee_id}/{field_request_id}-{kind}-{timestamp}.jpg
--      leave-certs/{employee_id}/{leave_request_id}.pdf
--      asset-docs/{asset_id}/{filename}
--  • iOS อาจส่งไฟล์ .heic — รองรับใน mime แล้ว แต่แนะนำ convert เป็น jpeg/webp ก่อนอัปเพื่อความเข้ากันได้
-- =============================================================================
