-- =============================================================================
-- IRDP — เปิด/ปิดหลักสูตร + รายละเอียดหลักสูตรแยกเก็บตามรุ่น + รูปผู้เข้าอบรม
--
-- - training_courses.is_open: สวิตช์ "หลักสูตรนี้เปิดรับอยู่ไหม" (สำหรับระบบอื่น
--   อ่านต่อภายหลัง เช่น หน้าสาธารณะ)
-- - training_batches.description/target_group/objectives: รายละเอียดหลักสูตร ณ
--   รุ่นนั้นๆ (ก๊อปจาก training_courses ตอนสร้างรุ่นใหม่ แล้วแก้ไขแยกอิสระได้ต่อรุ่น
--   เพราะรายละเอียดเปลี่ยนทุกรุ่น เช่น รุ่น 15 vs รุ่น 16)
-- - training_participants.photo_url: รูปผู้เข้าอบรม (bucket training-photos)
-- =============================================================================

alter table training_courses add column if not exists is_open boolean not null default true;

alter table training_batches add column if not exists description text;
alter table training_batches add column if not exists target_group text;
alter table training_batches add column if not exists objectives text;

alter table training_participants add column if not exists photo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('training-photos', 'training-photos', true, 3145728,
     array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists training_photos_select on storage.objects;
drop policy if exists training_photos_write on storage.objects;
drop policy if exists training_photos_update on storage.objects;
drop policy if exists training_photos_delete on storage.objects;

create policy training_photos_select on storage.objects for select
  using (bucket_id = 'training-photos');

create policy training_photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'training-photos');

create policy training_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'training-photos')
  with check (bucket_id = 'training-photos');

create policy training_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'training-photos');
