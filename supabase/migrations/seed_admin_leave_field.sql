-- =============================================================================
-- IRDP — Import ฐานข้อมูลการลา + นอกสถานที่/OT/WFH ฝ่ายธุรการ (เดิม) → (121 รายการ)
--   leave 1-3 → leave_requests (นับเข้าโควตาปีนั้น ผ่าน fn_recompute_leave_balance)
--   field 4-6 → field_requests (fn_field_autofill คำนวณ OT ให้อัตโนมัติสำหรับ offsite)
-- ชั่วโมงใช้ค่าจากคอลัมน์ "ชั่วโมง" ในชีตเดิมโดยตรง (แม่นกว่าคำนวณใหม่)
-- ใช้ DO block + exception per-row เพื่อข้ามแถวที่ชนกฎ (เช่น WFH ทับวันเดียวกัน)
-- โดยไม่ทำให้ import ทั้งชุดล้ม
-- =============================================================================

do $$
declare
  r record;
  emp_id uuid;
  n_leave int := 0;
  n_field int := 0;
  n_skip  int := 0;
  y int;
begin
  for r in
    select * from (values
  ('leave','somchit@irdp.org','sick','หาหมอ','2026-01-22T08:30:00+07:00','2026-01-22T17:00:00+07:00','approved',8.5,'2026-01-22'),
  ('leave','maytika@irdp.org','personal','ลูกป่วย','2025-12-30T08:30:00+07:00','2025-12-30T12:00:00+07:00','approved',3.5,'2025-12-30'),
  ('leave','maytika@irdp.org','vacation','ลาพักร้อน','2025-12-26T08:30:00+07:00','2025-12-26T17:00:00+07:00','approved',8.5,'2025-12-26'),
  ('leave','napat@irdp.org','personal','ไปธนาคาร','2026-01-15T13:00:00+07:00','2026-01-15T14:00:00+07:00','approved',1.0,'2026-01-15'),
  ('leave','napat@irdp.org','sick','คุณหมอนัดตรวจตาค่ะ','2026-01-16T09:00:00+07:00','2026-01-16T12:00:00+07:00','approved',3.0,'2026-01-16'),
  ('leave','patcharanan@irdp.org','personal','ดูเเลเด็ก','2026-01-14T08:30:00+07:00','2026-01-14T17:00:00+07:00','approved',8.5,'2026-01-14'),
  ('leave','arnon@irdp.org','sick','กินยาแล้วหลับลึกเกิน (เอกสารแนบ: https://drive.google.com/open?id=1XpjfD4_yZln3YqRYR84nRl6Al6BKhLog)','2026-01-20T08:30:00+07:00','2026-01-20T10:00:00+07:00','approved',1.5,'2026-01-20'),
  ('leave','arnon@irdp.org','personal','งานศพตา (เอกสารแนบ: https://drive.google.com/open?id=1iR0zNsoKS1DFQVcx46Y9sqMR6gmK_ahz)','2026-01-05T08:30:00+07:00','2026-01-05T17:00:00+07:00','approved',8.5,'2026-01-05'),
  ('leave','arnon@irdp.org','personal','งานศพตา (เอกสารแนบ: https://drive.google.com/open?id=1mCkrD2KyGFpp8TJ5EDNIKMK4Ue7goDEh)','2026-01-06T08:30:00+07:00','2026-01-06T17:00:00+07:00','approved',8.5,'2026-01-06'),
  ('field','arnon@irdp.org','ot','อัพเดทเว็บไซต์training เปิดห้องประชุมและสร้างลิ้งค์ประเมิน แก้ระบบไดรฟกลางพี่ปู ส่งเมลประชาสัมพันธ์วิจัย','2026-01-06T20:00:00+07:00','2026-01-06T23:00:00+07:00','approved',3.0,'2026-01-06'),
  ('leave','napat@irdp.org','personal','ไปหาพ่อเพชรบุรี','2026-01-26T08:30:00+07:00','2026-01-26T17:00:00+07:00','approved',8.5,'2026-01-26'),
  ('leave','patcharanan@irdp.org','personal','พาลูกไปหาหมอ','2026-01-22T08:30:00+07:00','2026-01-22T17:00:00+07:00','approved',8.5,'2026-01-22'),
  ('field','arnon@irdp.org','offsite','รฟม','2026-01-14T08:30:00+07:00','2026-01-14T12:00:00+07:00','approved',3.5,'2026-01-14'),
  ('field','arnon@irdp.org','offsite','รฟม','2026-01-21T08:30:00+07:00','2026-01-21T12:00:00+07:00','approved',3.5,'2026-01-21'),
  ('field','arnon@irdp.org','ot','ทำเพจให้ อ.วรภัทร','2026-01-25T12:00:00+07:00','2026-01-25T14:00:00+07:00','approved',2.0,'2026-01-25'),
  ('field','arnon@irdp.org','ot','ทำโพล ดร.เสรี','2026-01-26T21:00:00+07:00','2026-01-26T22:00:00+07:00','approved',1.0,'2026-01-26'),
  ('field','arnon@irdp.org','wfh','ประสานงาน และทำโพลบรรยาย ดร เสรี ซื้อกรอบรูปโน้ตเพลงกับอะไหล่ตู้ สร้าลิงค์ประชุมบวท มอติเตอรการประชุม สคร','2026-01-27T06:30:00+07:00','2026-01-27T11:00:00+07:00','approved',4.5,'2026-01-27'),
  ('leave','chotika@irdp.org','vacation','กลับบ้านต่างจังหวัด','2026-02-04T08:30:00+07:00','2026-02-05T17:00:00+07:00','approved',8.5,'2026-02-04'),
  ('field','arnon@irdp.org','offsite','รฟม','2026-01-28T08:30:00+07:00','2026-01-28T12:00:00+07:00','approved',3.5,'2026-01-28'),
  ('leave','nattporn@irdp.org','personal','ไปงานฌาปนกิจญาติสนิทที่นครปฐมค่ะ','2026-02-03T08:30:00+07:00','2026-02-03T17:00:00+07:00','approved',8.5,'2026-02-03'),
  ('field','arnon@irdp.org','offsite','รฟม','2026-02-04T08:30:00+07:00','2026-02-04T12:00:00+07:00','approved',3.5,'2026-02-04'),
  ('leave','arnon@irdp.org','personal','พาพ่อไปทำธุระที่ประจวบ','2026-02-06T08:30:00+07:00','2026-02-06T17:00:00+07:00','approved',8.5,'2026-02-06'),
  ('leave','patcharanan@irdp.org','sick','อุบัติเหตุ','2026-02-02T08:30:00+07:00','2026-02-03T17:00:00+07:00','approved',8.5,'2026-02-02'),
  ('field','arnon@irdp.org','offsite','กกท c8','2026-02-09T07:30:00+07:00','2026-02-09T17:00:00+07:00','approved',9.5,'2026-02-09'),
  ('field','napat@irdp.org','ot','ไปรับขนมให้ดร.ค่ะ','2026-02-06T16:40:00+07:00','2026-02-06T17:00:00+07:00','approved',0.33,'2026-02-06'),
  ('field','arnon@irdp.org','ot','ทำสไลด์ อจวรภัทร แตกไฟล์ ธสน จัดระเบียบไฟล์ไดรฟ และโหลดวิดีโอ zoom ลง ไดรฟ ฝ่ายประเมิน','2026-02-10T20:00:00+07:00','2026-02-10T23:30:00+07:00','approved',3.5,'2026-02-10'),
  ('field','arnon@irdp.org','offsite','กกท','2026-02-11T07:30:00+07:00','2026-02-11T17:00:00+07:00','approved',9.5,'2026-02-11'),
  ('field','arnon@irdp.org','ot','ถ่ายโอนไฟล์รูปจากกล้อง คัดรูป เก็บในไดรฟกลาง ตัดวิดีโอ บรรยากาศรอยากาศการอบรม กกท','2026-02-11T22:00:00+07:00','2026-02-11T23:50:00+07:00','approved',1.83,'2026-02-11'),
  ('leave','supat@irdp.org','sick','ไปหาหมอ','2026-02-12T08:30:00+07:00','2026-02-12T10:30:00+07:00','approved',2.0,'2026-02-12'),
  ('leave','napat@irdp.org','personal','ไปหาคุณพ่อค่ะ','2026-02-16T08:30:00+07:00','2026-02-16T17:00:00+07:00','approved',8.5,'2026-02-16'),
  ('leave','nattporn@irdp.org','personal','ไหว้ตรุษจีนที่บ้านนครปฐม ค่ะ','2026-02-16T08:30:00+07:00','2026-02-16T17:00:00+07:00','approved',8.5,'2026-02-16'),
  ('leave','patcharanan@irdp.org','personal','เข้าสายน้ำท่วมค่ะ','2026-02-16T08:30:00+07:00','2026-02-16T09:30:00+07:00','approved',1.0,'2026-02-16'),
  ('leave','patcharanan@irdp.org','personal','ไปงานศพญาติ','2026-02-17T08:30:00+07:00','2026-02-17T17:00:00+07:00','approved',8.5,'2026-02-17'),
  ('leave','patcharanan@irdp.org','personal','ไปรับลูก','2026-02-18T15:45:00+07:00','2026-02-18T17:00:00+07:00','approved',1.25,'2026-02-18'),
  ('leave','pornpan@irdp.org','vacation','ไปต่างประเทศ','2026-03-02T08:30:00+07:00','2026-03-02T17:00:00+07:00','approved',8.5,'2026-03-02'),
  ('leave','arnon@irdp.org','personal','ไปส่งแม่สนามบิน','2026-02-23T15:00:00+07:00','2026-02-23T17:00:00+07:00','approved',2.0,'2026-02-23'),
  ('leave','arnon@irdp.org','sick','แพ้อาหาร อาเจียน ท้องเสีย มีตุ่มขึ้นที่ตัว','2026-02-24T08:30:00+07:00','2026-02-24T17:00:00+07:00','approved',8.5,'2026-02-24'),
  ('field','arnon@irdp.org','offsite','กกท อาจารย์ บรรยาย','2026-03-09T07:30:00+07:00','2026-03-09T17:00:00+07:00','approved',9.5,'2026-03-09'),
  ('field','arnon@irdp.org','offsite','กกท','2026-03-30T07:30:00+07:00','2026-03-30T17:00:00+07:00','approved',9.5,'2026-03-30'),
  ('leave','maytika@irdp.org','sick','ไปพบแพทย์ วิชัยยุทธ','2026-03-09T10:45:00+07:00','2026-03-09T13:00:00+07:00','approved',2.25,'2026-03-09'),
  ('leave','maytika@irdp.org','personal','ทำธุระเรื่องรถ','2026-03-12T08:30:00+07:00','2026-03-12T12:00:00+07:00','approved',3.5,'2026-03-12'),
  ('leave','somchit@irdp.org','vacation','พักร้อน','2026-04-16T08:30:00+07:00','2026-04-16T17:00:00+07:00','approved',8.5,'2026-04-16'),
  ('leave','arnon@irdp.org','sick','เจ็บคอมีไข้','2026-03-13T08:30:00+07:00','2026-03-13T17:00:00+07:00','approved',8.5,'2026-03-13'),
  ('leave','nattporn@irdp.org','vacation','ไปทำบุญวัดมหาธาตุฯนครศรีธรรมราช','2026-02-27T08:30:00+07:00','2026-02-27T17:00:00+07:00','approved',8.5,'2026-02-27'),
  ('leave','nattporn@irdp.org','vacation','ไปทำบุญวัดมหาธาตุฯนครศรีธรรมราช','2026-03-02T08:30:00+07:00','2026-03-02T17:00:00+07:00','approved',8.5,'2026-03-02'),
  ('leave','napat@irdp.org','personal','กลับไปหาคุณพ่อ','2026-03-16T08:30:00+07:00','2026-03-16T17:00:00+07:00','approved',8.5,'2026-03-16'),
  ('field','arnon@irdp.org','offsite','Esg','2026-03-16T08:30:00+07:00','2026-03-16T17:00:00+07:00','approved',8.5,'2026-03-16'),
  ('leave','arnon@irdp.org','sick','ถ่ายหนัก ขออนุญาตลา 2 ชม ครับ','2026-03-19T08:30:00+07:00','2026-03-19T10:00:00+07:00','approved',1.5,'2026-03-19'),
  ('leave','supat@irdp.org','sick','ปวดหัวอาเจียน','2026-03-23T08:30:00+07:00','2026-03-23T17:00:00+07:00','approved',8.5,'2026-03-23'),
  ('field','arnon@irdp.org','offsite','กกท c9','2026-03-23T07:30:00+07:00','2026-03-23T13:00:00+07:00','approved',5.5,'2026-03-23'),
  ('field','arnon@irdp.org','ot','ทำโพล บงส','2026-03-21T11:00:00+07:00','2026-03-21T14:00:00+07:00','approved',3.0,'2026-03-21'),
  ('leave','napat@irdp.org','sick','คุณหมอนัดเจาะเลือด','2026-03-24T08:30:00+07:00','2026-03-24T17:00:00+07:00','approved',8.5,'2026-03-24'),
  ('field','arnon@irdp.org','wfh','เวียนหัว','2026-03-24T08:30:00+07:00','2026-03-24T10:30:00+07:00','approved',2.0,'2026-03-24'),
  ('leave','supat@irdp.org','personal','ไปหาหมอรับยา','2026-03-26T14:30:00+07:00','2026-03-26T15:00:00+07:00','approved',0.5,'2026-03-26'),
  ('leave','arnon@irdp.org','personal','ช่างมาซ่อมแอร์','2026-03-27T08:30:00+07:00','2026-03-27T10:30:00+07:00','approved',2.0,'2026-03-27'),
  ('field','arnon@irdp.org','ot','ทำโพล วตท ดร เสรี','2026-03-28T08:00:00+07:00','2026-03-28T11:00:00+07:00','approved',3.0,'2026-03-28'),
  ('field','arnon@irdp.org','offsite','กกท','2026-03-30T07:30:00+07:00','2026-03-30T13:00:00+07:00','approved',5.5,'2026-03-30'),
  ('leave','patcharanan@irdp.org','vacation','ไปต่างจังหวัด','2026-04-07T08:30:00+07:00','2026-04-07T17:00:00+07:00','approved',8.5,'2026-04-07'),
  ('leave','napat@irdp.org','personal','พาคุณพ่อหาหมอค่ะ','2026-04-07T08:30:00+07:00','2026-04-07T17:00:00+07:00','approved',8.5,'2026-04-07'),
  ('leave','napat@irdp.org','vacation','พาพ่อหาหมอค่ะ','2026-04-07T08:30:00+07:00','2026-04-07T17:00:00+07:00','approved',8.5,'2026-04-07'),
  ('leave','arnon@irdp.org','personal','เทสระบบลา','2026-04-03T08:30:00+07:00','2026-04-03T17:00:00+07:00','approved',8.5,'2026-04-03'),
  ('leave','maytika@irdp.org','vacation','ลาพักร้อน ไประนอง','2026-04-03T08:30:00+07:00','2026-04-03T17:00:00+07:00','approved',8.5,'2026-04-03'),
  ('leave','maytika@irdp.org','vacation','ลาพักร้อน ไประนอง','2026-04-07T08:30:00+07:00','2026-04-07T17:00:00+07:00','approved',8.5,'2026-04-07'),
  ('leave','patcharanan@irdp.org','personal','พาลูกไปหาหมอ','2026-04-16T08:30:00+07:00','2026-04-16T17:00:00+07:00','approved',8.5,'2026-04-16'),
  ('field','arnon@irdp.org','offsite','LSP pattaya','2026-04-09T07:00:00+07:00','2026-04-09T22:00:00+07:00','approved',15.0,'2026-04-09'),
  ('field','arnon@irdp.org','offsite','LSP pattaya','2026-04-10T08:00:00+07:00','2026-04-10T17:00:00+07:00','approved',9.0,'2026-04-10'),
  ('field','arnon@irdp.org','offsite','ดูงาน cpf หนองจอก','2026-04-17T08:30:00+07:00','2026-04-17T17:00:00+07:00','approved',8.5,'2026-04-17'),
  ('field','arnon@irdp.org','offsite','เปิด pep','2026-04-07T08:30:00+07:00','2026-04-07T17:00:00+07:00','approved',8.5,'2026-04-07'),
  ('field','arnon@irdp.org','offsite','Egat','2026-04-27T13:00:00+07:00','2026-04-27T17:00:00+07:00','approved',4.0,'2026-04-27'),
  ('field','arnon@irdp.org','offsite','Egat','2026-04-28T07:30:00+07:00','2026-04-28T17:00:00+07:00','approved',9.5,'2026-04-28'),
  ('leave','maytika@irdp.org','personal','เอารถไปเข้าศูนย์','2026-04-21T08:30:00+07:00','2026-04-21T13:00:00+07:00','approved',4.5,'2026-04-21'),
  ('leave','pornpan@irdp.org','vacation','ไปต่างประเทศ','2026-05-07T08:30:00+07:00','2026-05-08T17:00:00+07:00','approved',8.5,'2026-05-07'),
  ('leave','pornpan@irdp.org','vacation','ไปต่างประเทศ','2026-05-25T08:30:00+07:00','2026-05-26T17:00:00+07:00','approved',8.5,'2026-05-25'),
  ('field','arnon@irdp.org','offsite','esg5 & pep21','2026-04-21T08:30:00+07:00','2026-04-21T17:00:00+07:00','approved',8.5,'2026-04-21'),
  ('field','arnon@irdp.org','offsite','esg5 อาจารย์เสรี กะบถ่ายรูป พิธีปิด pep21','2026-04-22T08:30:00+07:00','2026-04-22T20:00:00+07:00','approved',11.5,'2026-04-22'),
  ('leave','arnon@irdp.org','sick','มีไข้','2026-04-27T08:30:00+07:00','2026-04-27T11:00:00+07:00','approved',2.5,'2026-04-27'),
  ('leave','supat@irdp.org','sick','ไปหาหมอ','2026-04-28T08:30:00+07:00','2026-04-28T17:00:00+07:00','approved',8.5,'2026-04-28'),
  ('leave','maytika@irdp.org','sick','พบแพทย์','2026-04-27T16:00:00+07:00','2026-04-27T17:00:00+07:00','approved',1.0,'2026-04-27'),
  ('field','arnon@irdp.org','offsite','LSP17 อบรมครั้งที่ 1','2026-04-24T07:30:00+07:00','2026-04-24T17:00:00+07:00','approved',9.5,'2026-04-24'),
  ('field','arnon@irdp.org','offsite','เตรียมงานที่นครนายก','2026-04-27T14:30:00+07:00','2026-04-27T17:00:00+07:00','approved',2.5,'2026-04-27'),
  ('field','arnon@irdp.org','offsite','ถ่ายรูปงานสัมนา egat','2026-04-28T08:00:00+07:00','2026-04-28T16:00:00+07:00','approved',8.0,'2026-04-28'),
  ('field','arnon@irdp.org','offsite','เปิดลิ้งประชุม พี่ปูห้องเคียงตะวัน ถ่ายรูปรับวุฒิ พิธีปิด leap','2026-04-28T17:00:00+07:00','2026-04-28T18:00:00+07:00','approved',1.0,'2026-04-28'),
  ('field','arnon@irdp.org','ot','ตัดคลิป ดร เสรี ออกทีวี zaabtoday','2026-04-27T19:00:00+07:00','2026-04-27T20:00:00+07:00','approved',1.0,'2026-04-27'),
  ('leave','nattporn@irdp.org','personal','ไปออกรถใหม่กับครอบครัว','2026-04-29T08:30:00+07:00','2026-04-29T17:30:00+07:00','approved',9.0,'2026-04-29'),
  ('leave','nattporn@irdp.org','vacation','ไปเที่ยวระยองกับครอบครัว','2026-05-05T08:30:00+07:00','2026-05-05T17:00:00+07:00','approved',8.5,'2026-05-05'),
  ('leave','patcharanan@irdp.org','sick','ปวดท้อง ปจด.','2026-05-06T08:30:00+07:00','2026-05-06T00:00:00+07:00','approved',15.5,'2026-05-06'),
  ('leave','supat@irdp.org','sick','ไปหาหมอ','2026-05-07T08:30:00+07:00','2026-05-07T09:30:00+07:00','approved',1.0,'2026-05-07'),
  ('leave','maytika@irdp.org','personal','ไปงานศพ','2026-05-08T11:30:00+07:00','2026-05-08T17:00:00+07:00','approved',5.5,'2026-05-08'),
  ('field','arnon@irdp.org','offsite','LSP17 ช่วยงาน','2026-05-08T07:30:00+07:00','2026-05-08T20:00:00+07:00','approved',12.5,'2026-05-08'),
  ('field','arnon@irdp.org','wfh','บริจาคเลือด ขอ wfh','2026-05-13T08:30:00+07:00','2026-05-13T17:00:00+07:00','approved',8.5,'2026-05-13'),
  ('field','arnon@irdp.org','offsite','เปิดหลักสูตร bep8','2026-05-14T11:00:00+07:00','2026-05-14T20:00:00+07:00','approved',9.0,'2026-05-14'),
  ('field','arnon@irdp.org','offsite','หลักสูตร LSP','2026-05-15T07:30:00+07:00','2026-05-15T18:00:00+07:00','approved',10.5,'2026-05-15'),
  ('leave','arnon@irdp.org','personal','พาครอบครัวไปทำธุระ','2026-05-18T08:30:00+07:00','2026-05-18T17:00:00+07:00','approved',8.5,'2026-05-18'),
  ('field','arnon@irdp.org','wfh','อัพเดทโปรแกรม hrmi','2026-05-18T13:40:00+07:00','2026-05-18T17:00:00+07:00','approved',3.33,'2026-05-18'),
  ('leave','napat@irdp.org','sick','คุณหมอนัดเอกซเรย์กระดูกค่ะ','2026-05-21T08:30:00+07:00','2026-05-21T17:00:00+07:00','approved',8.5,'2026-05-21'),
  ('leave','supat@irdp.org','sick','ไปหาหมอ','2026-05-26T08:30:00+07:00','2026-05-26T11:00:00+07:00','approved',2.5,'2026-05-26'),
  ('leave','supat@irdp.org','vacation','กลับต่างจังหวัด','2026-06-02T08:30:00+07:00','2026-06-02T17:00:00+07:00','approved',8.5,'2026-06-02'),
  ('leave','supat@irdp.org','personal','ไปต่างจังหวัด','2026-05-29T16:30:00+07:00','2026-05-29T17:00:00+07:00','approved',0.5,'2026-05-29'),
  ('leave','arnon@irdp.org','vacation','ลาพักร้อน','2026-06-02T08:30:00+07:00','2026-06-02T17:00:00+07:00','approved',8.5,'2026-06-02'),
  ('leave','nattporn@irdp.org','vacation','ไปปฏิบัติธรรมที่วัดอัมพวัน','2026-06-05T08:30:00+07:00','2026-06-05T17:00:00+07:00','approved',8.5,'2026-06-05'),
  ('field','arnon@irdp.org','offsite','ตั้งเครื่อง มินิเตอร ประชุม ฝ่ายประเมินที่ สคร','2026-06-09T08:00:00+07:00','2026-06-09T17:00:00+07:00','approved',9.0,'2026-06-09'),
  ('leave','maytika@irdp.org','vacation','จัดงานศพพ่อ ที่ระนอง','2026-05-28T08:30:00+07:00','2026-05-29T17:00:00+07:00','approved',8.5,'2026-05-28'),
  ('leave','maytika@irdp.org','vacation','จัดงานศพพ่อ ที่ระนอง','2026-06-02T08:30:00+07:00','2026-06-02T17:00:00+07:00','approved',8.5,'2026-06-02'),
  ('leave','maytika@irdp.org','vacation','จัดงานศพพ่อ ที่ระนอง','2026-06-03T08:30:00+07:00','2026-06-04T17:00:00+07:00','approved',8.5,'2026-06-03'),
  ('leave','napat@irdp.org','vacation','กลับเพชรบุรี','2026-06-12T08:30:00+07:00','2026-06-12T17:00:00+07:00','approved',8.5,'2026-06-12'),
  ('leave','patcharanan@irdp.org','personal','พาลูกไปหาหมอ','2026-06-10T08:30:00+07:00','2026-06-10T17:00:00+07:00','approved',8.5,'2026-06-10'),
  ('field','arnon@irdp.org','offsite','สคร','2026-06-08T13:00:00+07:00','2026-06-08T16:00:00+07:00','approved',3.0,'2026-06-08'),
  ('field','arnon@irdp.org','offsite','ปิด pep ดร เสรี','2026-06-10T08:30:00+07:00','2026-06-10T21:00:00+07:00','approved',12.5,'2026-06-10'),
  ('field','arnon@irdp.org','offsite','Bep dr.seree','2026-06-11T10:00:00+07:00','2026-06-11T21:10:00+07:00','approved',11.17,'2026-06-11'),
  ('field','arnon@irdp.org','offsite','LSP dr.seree งานเลี้ยง','2026-06-12T08:30:00+07:00','2026-06-12T22:31:00+07:00','approved',14.02,'2026-06-12'),
  ('field','arnon@irdp.org','offsite','สัมมนา HR','2026-06-17T08:30:00+07:00','2026-06-17T17:00:00+07:00','approved',8.5,'2026-06-17'),
  ('leave','patcharanan@irdp.org','vacation','ลาพักร้อน','2026-07-30T08:30:00+07:00','2026-07-31T17:00:00+07:00','approved',8.5,'2026-07-30'),
  ('leave','arnon@irdp.org','sick','ปวดท้อง','2026-06-24T08:30:00+07:00','2026-06-24T10:30:00+07:00','approved',2.0,'2026-06-24'),
  ('leave','arnon@irdp.org','sick','เวียนหัว','2026-06-26T08:30:00+07:00','2026-06-26T12:00:00+07:00','approved',3.5,'2026-06-26'),
  ('leave','patcharanan@irdp.org','personal','ลากิจคุณย่าป่วย','2026-06-24T08:30:00+07:00','2026-06-24T17:00:00+07:00','approved',8.5,'2026-06-24'),
  ('field','patcharanan@irdp.org','offsite','รับเช็ค LSP17','2026-06-29T08:30:00+07:00','2026-06-29T11:30:00+07:00','approved',3.0,'2026-06-29'),
  ('leave','chotika@irdp.org','vacation','กลับบ้านต่างจังหวัด','2026-07-27T08:30:00+07:00','2026-07-27T17:00:00+07:00','submitted',8.5,'2026-07-27'),
  ('leave','napat@irdp.org','vacation','กลับเพชรบุรีไปหาพ่อค่ะ','2026-07-13T08:30:00+07:00','2026-07-13T17:00:00+07:00','submitted',8.5,'2026-07-13'),
  ('leave','patcharanan@irdp.org','sick','หมอนัด','2026-07-16T16:00:00+07:00','2026-07-16T17:00:00+07:00','submitted',1.0,'2026-07-16'),
  ('leave','supat@irdp.org','sick','หมอนัด','2026-07-17T16:00:00+07:00','2026-07-17T17:00:00+07:00','submitted',1.0,'2026-07-17'),
  ('leave','arnon@irdp.org','personal','พาพ่อไปเจาะเลือด หมอนัด (เอกสารแนบ: https://drive.google.com/open?id=16EUU9pOAlCLn9Y-rS6gXKqROGluTvx5w)','2026-07-20T08:30:00+07:00','2026-07-20T11:00:00+07:00','submitted',2.5,'2026-07-20')
    ) as v(kind, email, code, reason, start_at, end_at, status, hours, work_date)
  loop
    begin
      select id into emp_id from employees where lower(email) = lower(r.email);
      if emp_id is null then
        n_skip := n_skip + 1;
        continue;
      end if;

      if r.kind = 'leave' then
        insert into leave_requests (employee_id, leave_code, start_at, end_at, hours, reason, status, approver_id, decided_at)
        values (emp_id, r.code::leave_code_t, r.start_at::timestamptz, r.end_at::timestamptz, r.hours::numeric,
                nullif(r.reason,''), r.status::request_status_t,
                case when r.status='approved' then (select id from employees where email='nattporn@irdp.org') else null end,
                case when r.status='approved' then r.start_at::timestamptz else null end);
        n_leave := n_leave + 1;

        if r.status = 'approved' then
          y := extract(year from (r.start_at::timestamptz at time zone 'Asia/Bangkok'))::int;
          perform fn_recompute_leave_balance(emp_id, y);
        end if;
      else
        insert into field_requests (employee_id, type, work_date, planned_start, planned_end, reason, status, approver_id, decided_at)
        values (emp_id, r.code::attendance_type_t, r.work_date::date, r.start_at::timestamptz, r.end_at::timestamptz,
                nullif(r.reason,''), r.status::request_status_t,
                case when r.status='approved' then (select id from employees where email='nattporn@irdp.org') else null end,
                case when r.status='approved' then r.start_at::timestamptz else null end);
        n_field := n_field + 1;
      end if;
    exception when others then
      n_skip := n_skip + 1;
      raise notice 'skip % (%): %', r.email, r.kind, sqlerrm;
    end;
  end loop;

  raise notice 'imported leave=% field=% skipped=%', n_leave, n_field, n_skip;
end $$;

select leave_code, count(*) from leave_requests
  where employee_id in (select id from employees where department_id = (select id from departments where name='ธุรการ'))
  group by leave_code;
select type, count(*) from field_requests
  where employee_id in (select id from employees where department_id = (select id from departments where name='ธุรการ'))
  group by type;
