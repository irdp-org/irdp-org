-- =============================================================================
-- IRDP — เพิ่มคอลัมน์รองรับการนำเข้าฐานข้อมูลผู้เข้าอบรมจากไฟล์เก่า
--
-- - training_courses.code: รหัสหลักสูตร (เช่น "DE4M", "PEP") ใช้จับกลุ่มรุ่น
-- - training_batches.code: รหัสรุ่นเดิมจากไฟล์ (เช่น "DE4M1") unique ทั้งตาราง
--   ใช้เป็น import key กันซ้ำเวลารันสคริปต์นำเข้าซ้ำ
-- - training_participants.prefix / nickname: คำนำหน้า / ชื่อเล่น (ของเดิมไม่มี)
-- =============================================================================

alter table training_courses add column if not exists code text;
alter table training_courses drop constraint if exists training_courses_code_key;
alter table training_courses add constraint training_courses_code_key unique (code);

alter table training_batches add column if not exists code text;
alter table training_batches drop constraint if exists training_batches_code_key;
alter table training_batches add constraint training_batches_code_key unique (code);

alter table training_participants add column if not exists prefix text;
alter table training_participants add column if not exists nickname text;
