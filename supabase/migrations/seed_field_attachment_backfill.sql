-- =============================================================================
-- IRDP — Backfill: 12 field_requests (นอกสถานที่/OT/WFH) ที่ลิงก์เอกสารแนบ
-- หายไปตอน import ครั้งก่อน (seed_admin_leave_field.sql ต่อ URL ให้เฉพาะฝั่งลา
-- ไม่ได้ทำกับฝั่ง field) — เติมกลับโดย match employee + planned_start + reason
-- เพื่อความจำเพาะ (บาง reason ซ้ำกันคนละเวลา เช่น "กกท")
-- Idempotent: ข้ามแถวที่มีเอกสารแนบต่อท้ายอยู่แล้ว
-- =============================================================================

with fixes (email, planned_start, old_reason, url) as (
  values
  ('arnon@irdp.org','2026-01-06T20:00:00+07:00','อัพเดทเว็บไซต์training เปิดห้องประชุมและสร้างลิ้งค์ประเมิน แก้ระบบไดรฟกลางพี่ปู ส่งเมลประชาสัมพันธ์วิจัย','https://drive.google.com/open?id=1pj4ldZHkRrRNWNTJFGHm1jZ2wPQleAaJ'),
  ('arnon@irdp.org','2026-01-25T12:00:00+07:00','ทำเพจให้ อ.วรภัทร','https://drive.google.com/open?id=10j2ol2a_lupXAgNxGCCe1wWcU4yVFEje'),
  ('arnon@irdp.org','2026-01-26T21:00:00+07:00','ทำโพล ดร.เสรี','https://drive.google.com/open?id=1E29g44O6VedQhvu9g2RnTniLOXlQzpeG'),
  ('arnon@irdp.org','2026-02-09T07:30:00+07:00','กกท c8','https://drive.google.com/open?id=1LUsZbLdpPPYO3p8WQqAvBfp984jB0b0r'),
  ('arnon@irdp.org','2026-02-10T20:00:00+07:00','ทำสไลด์ อจวรภัทร แตกไฟล์ ธสน จัดระเบียบไฟล์ไดรฟ และโหลดวิดีโอ zoom ลง ไดรฟ ฝ่ายประเมิน','https://drive.google.com/open?id=1hApX-Nt0jcKjAYnd4hj6VG8qcP4jUgVo'),
  ('arnon@irdp.org','2026-03-30T07:30:00+07:00','กกท','https://drive.google.com/open?id=1Rhg0ql2fHVogzsLcsNXHNLu16sdYVMzw'),
  ('arnon@irdp.org','2026-05-13T08:30:00+07:00','บริจาคเลือด ขอ wfh','https://drive.google.com/open?id=1LZtJ2gLUHW7_HDXfIgcs0T-XA_rlPFH1'),
  ('arnon@irdp.org','2026-05-18T13:40:00+07:00','อัพเดทโปรแกรม hrmi','https://drive.google.com/open?id=1WkDbN_y_VqdZ74ICAoxAMM12Dk3Ebkuk'),
  ('arnon@irdp.org','2026-06-10T08:30:00+07:00','ปิด pep ดร เสรี','https://drive.google.com/open?id=1I98pCJruXs2Atc-RPJLxRJJUMgEJBiuO'),
  ('arnon@irdp.org','2026-06-11T10:00:00+07:00','Bep dr.seree','https://drive.google.com/open?id=10cgWRizci0nsmZx50gFPdV-NBEx26-IW'),
  ('arnon@irdp.org','2026-06-12T08:30:00+07:00','LSP dr.seree งานเลี้ยง','https://drive.google.com/open?id=1sDcJD9C9IZe_gGkI2U6nAVL7UhyCgmuT'),
  ('arnon@irdp.org','2026-06-17T08:30:00+07:00','สัมมนา HR','https://drive.google.com/open?id=1BhBOTW3h70iZwwcP3xNAAHoQbTvrePKw')
)
update field_requests fr
set reason = fr.reason || ' (เอกสารแนบ: ' || f.url || ')'
from fixes f
where fr.employee_id = (select id from employees where lower(email) = lower(f.email))
  and fr.planned_start = f.planned_start::timestamptz
  and fr.reason = f.old_reason
  and fr.reason not like '%เอกสารแนบ:%';

select count(*) as backfilled from field_requests where reason like '%เอกสารแนบ:%';
