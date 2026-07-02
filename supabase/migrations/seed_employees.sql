-- =============================================================================
-- IRDP — Employee roster import (38 คน)
-- รัน *หลัง* migration 0017_employee_import_prep.sql (ต้องมีคอลัมน์ employee_code
-- และชื่อฝ่ายที่ปรับใหม่แล้ว)
--
-- - user_id เว้นว่าง: trigger handle_new_user() จะลิงก์ให้อัตโนมัติเมื่อแต่ละคน
--   ล็อกอิน Google ด้วยอีเมลที่ตรงกัน
-- - role: exec = ผู้บริหาร, dept_head = หัวหน้าฝ่าย, admin = อานนท์ (IT),
--   ที่เหลือ = employee
-- - avatar_url: ลิงก์ Google Drive แปลงเป็น thumbnail แล้ว; ลิงก์ glide เก็บตามเดิม
-- - รันซ้ำได้ (on conflict email do update)
-- =============================================================================

insert into employees
  (email, full_name, nickname, phone, desk_phone, position, employee_code, role, status, avatar_url, department_id)
select
  v.email, v.full_name, v.nickname, v.phone, v.desk_phone, v.position,
  v.employee_code, v.role::role_t, v.status::employee_status_t, v.avatar_url,
  (select id from departments d where d.name = v.dept)
from (values
  ('warapatr@irdp.org','วรภัทร โตธนะเกษม',null,null,null,'กรรมการผู้จัดการ','001/2555','exec','active','https://drive.google.com/thumbnail?id=1cmEtCOQXn3UPBxxhEC5H-4BYfZcBKCo3&sz=w1000','ผู้บริหาร'),
  ('seree@irdp.org','เสรี นนทสูติ',null,null,null,'รองกรรมการผู้จัดการอาวุโส','002/2555','exec','active','https://drive.google.com/thumbnail?id=1wJrH-4T_ayqshHOfPbDL-aqhCGrPGS3E&sz=w1000','ผู้บริหาร'),
  ('thawatchai@irdp.org','ธวัชชัย โพธิ์วรสุนทร',null,null,null,'ที่ปรึกษา','028/2556','exec','active','https://drive.google.com/thumbnail?id=1dtTaVeqcjxyKO2u3ElDZGpxf-6m_IXW_&sz=w1000','ผู้บริหาร'),
  ('khanita@irdp.org','คณิตา ชินะกาญจน์','ปุ้ม','081-646-2690','027145562','รองกรรมการผู้จัดการ','003/2555','exec','active','https://drive.google.com/thumbnail?id=1JMmCZMsZ4aIixNxeD5X-Hmnc6YgZDZjC&sz=w1000','ผู้บริหาร'),
  ('bawornwan@irdp.org','บวรวรรณ สุขใย','แก้ว','0816579517','027145569','ผู้อำนวยการอาวุโส ฝ่ายประเมินผล','007/2555','dept_head','active','https://drive.google.com/thumbnail?id=1Ii_HTV2RSzt06ZlXmHHoYkugVIVUzI6I&sz=w1000','ประเมินผล'),
  ('pawis@irdp.org','ภวิศร์ ภู่เพชร','จ๊อบ','098-241-4914','027145588','ผู้จัดการ','056/2560','employee','active','https://drive.google.com/thumbnail?id=1t-W49ipPo2HBCWWQLcX8f8INhVenOSQo&sz=w1000','ประเมินผล'),
  ('chanchai@irdp.org','ชาญชัย แซ่เจียง','ตี๋','085-333-7297','027145582','รองผู้จัดการ','082/2562','employee','active','https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/sj3LZRcJTxYR6dtMwjFE/pub/U54bwpcjaZ2Xk3n8Fg0a.jpg','ประเมินผล'),
  ('worapong@irdp.org','วรพงษ์ ตั้งพิมลจิตต์','กู๋','0894450906',null,'นักวิเคราะห์อาวุโส','107/2566','employee','active','https://drive.google.com/thumbnail?id=1U6uEdrmGaiHglXdyOvtYqeb3WegSvjj9&sz=w1000','ประเมินผล'),
  ('sirinun@irdp.org','ศิรินันท์ กำเนิด','ตั๊ก','080-566-3064','027145575','ผู้ช่วยผู้จัดการ','074/2561','employee','active','https://drive.google.com/thumbnail?id=1URNzFIKwyLivdmhzAM3zmAW8DPGmEvIw&sz=w1000','ประเมินผล'),
  ('phattaraphon@irdp.org','ภัทรพร จันทรขันตี','นิก','062-419-5616',null,'นักวิเคราะห์อาวุโส','116/2567','employee','active','https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/sj3LZRcJTxYR6dtMwjFE/pub/xughJZaTD40NBp7PsSZb.jpeg','ประเมินผล'),
  ('peetitas@irdp.org','ปีติทัศน์ ดำรงศักดิ์ตระกูล','หลิว','099-669-9234',null,'นักวิเคราะห์อาวุโส','109/2566','employee','active','https://drive.google.com/thumbnail?id=1oOY-Iivoylst0b4bvKGzC1LFPY-nBgMQ&sz=w1000','ประเมินผล'),
  ('thanongsak@irdp.org','ทนงศักดิ์ จิรวัฒนวิจิตร','เบิ้ล','085-885-8188',null,'นักวิเคราะห์อาวุโส','101/2565','employee','active','https://drive.google.com/thumbnail?id=1rmZBAyNzuPe6RDJeW5Ttqm6Vcrq23T5l&sz=w1000','ประเมินผล'),
  ('nattha@irdp.org','ณัฐฐา เจริญชาศรี','นัท','089-889-5149','027145584','ผู้ชำนาญการธุรการ 2','073/2561','employee','active','https://drive.google.com/thumbnail?id=188JqZk6IqkIal3tPlcrdxmGWv2RSWoGE&sz=w1000','ประเมินผล'),
  ('satit@irdp.org','สาธิต รอดภักดีกุล','อู๋','085-875-7177',null,'นักวิเคราะห์','110/2566','employee','active','https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/sj3LZRcJTxYR6dtMwjFE/pub/24E3wJdI1krJsx6DeQSc.jpg','ประเมินผล'),
  ('pattapong@irdp.org','พัฒพงศ์ จิตรมุ่ง','กอล์ฟ','081-816-3032',null,'นักวิเคราะห์อาวุโส','112/2566','employee','active','https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/sj3LZRcJTxYR6dtMwjFE/pub/c1EFfymMnVbIo0rpO7Kt.jpg','ประเมินผล'),
  ('tanakorn@irdp.org','ธนากร ไชยยศ','เบนซ์','094-058-8945',null,'นักวิเคราะห์','118/2567','employee','active','https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/sj3LZRcJTxYR6dtMwjFE/pub/f8EXaB0EoQlpJU8TqNs7.jpeg','ประเมินผล'),
  ('ruthairat@irdp.org','ฤทัยรัตน์ บุญจันทร์','อ๋อม','089-890-6658',null,'นักวิเคราะห์อาวุโส','121/2568','employee','active','https://drive.google.com/thumbnail?id=1Ip26Q-Hlet-yEYPA57R0MJXXqcLpVjUF&sz=w1000','ประเมินผล'),
  ('suprapada@irdp.org','สุประภาดา โชติมณี','ปู','061-423-9697',null,'ผู้ช่วยผู้จัดการ','115/2567','employee','active','https://drive.google.com/thumbnail?id=114Qukuwler5BZrQgWXtowSBHhJ4P6eo-&sz=w1000','สำนักกรรมการผู้จัดการ'),
  ('thunyathorn@irdp.org','ธัญญธร อุ่นอนุโลม','ธัญ','099-162-2651',null,'ผู้จัดการ','117/2567','dept_head','active','https://drive.google.com/thumbnail?id=1Yb3m5yZw5tbsxaqamVY9X7TRaBcrGGxx&sz=w1000','ฝึกอบรม'),
  ('chadatan@irdp.org','ชฎาธาร อินพันทัง','ฝ้าย','098-281-4953','027145567','รองผู้จัดการ','068/2561','employee','active','https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/sj3LZRcJTxYR6dtMwjFE/pub/qXd1ilTknZmm1027K3VB.jpg','ฝึกอบรม'),
  ('nitchada@irdp.org','ณิชชดา บุญสอน','อีฟ','064-242-6453','027145565','ผู้ชำนาญการฝึกอบรม 2','077/2562','employee','active','https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/sj3LZRcJTxYR6dtMwjFE/pub/FNOEhWUuV9eTYXR151Hv.jpeg','ฝึกอบรม'),
  ('eiea-karn@irdp.org','เอื้อการย์ พิทักษ์วัฒนนนท์','เอื้อ','096-426-4617','027145564','เจ้าหน้าที่ฝึกอบรมอาวุโส','099/2565','employee','active','https://drive.google.com/thumbnail?id=1aNnAZMVJo97cwcP5YAU8-f4nChbVBYiL&sz=w1000','ฝึกอบรม'),
  ('mephatcha@irdp.org','เมธ์ภัทร์ชา พชิรสิทธิรัตน์','สายป่าน','083-539-3236',null,'เจ้าหน้าที่ฝึกอบรมอาวุโส','113/2567','employee','active','https://drive.google.com/thumbnail?id=1yPbikJgKAKZh4ly2d7g5MV3x5ZDe7wIZ&sz=w1000','ฝึกอบรม'),
  ('thanita@irdp.org','ฐานิตา ธรรมสุวรรณ','ชมพู่','093-770-5318',null,'เจ้าหน้าที่ฝึกอบรม','C019/2569','employee','active',null,'ฝึกอบรม'),
  ('korrawee@irdp.org','กรวีร์ ศรีเสน','ปุ๋งปิ๋ง','088-989-5556','027145580','รองผู้จัดการ','064/2560','dept_head','active','https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/sj3LZRcJTxYR6dtMwjFE/pub/XSw58gfW33xoTSf3RP5k.jpg','วิจัยและพัฒนา'),
  ('siripong@irdp.org','ศิริพงศ์ สุขสัมฤทธิกุล','รุท','089-666-2091',null,'ผู้จัดการ',null,'employee','active','https://drive.google.com/thumbnail?id=1jDta0X6ZiUGyvQdYuYQks1dTpBXAq9YU&sz=w1000','วิจัยและพัฒนา'),
  ('chattanun@irdp.org','เชษฐนันท์ ทรัพย์ระเบียบ','ก็อต','098-995-6496','027145579','นักวิจัยอาวุโส','103/2565','employee','active','https://drive.google.com/thumbnail?id=1WkCEJkUG8b4agcZLEjcC84YGty9qwaHe&sz=w1000','วิจัยและพัฒนา'),
  ('waraporn@irdp.org','วราพร งามขำ','หมิว','099-757-2425','027145578','นักวิจัย','122/2569','employee','active','https://drive.google.com/thumbnail?id=16h93lbKI-x1DIFE4zKklesnxPrBl7GuQ&sz=w1000','วิจัยและพัฒนา'),
  ('chaiyanan@irdp.org','ชัยนันท์ วัชรสถาพรพงศ์','ก้อง','086-831-4499',null,'นักวิเคราะห์อาวุโส','120/2568','employee','active','https://drive.google.com/thumbnail?id=14ehF4tvwnlNTjz5z0GLi9QCkgdCEHnnq&sz=w1000','ประเมินผล'),
  ('nattporn@irdp.org','ณัฏฐ์ภรณ์ หงษ์เผือก','กระแต','083-878-8944','027145563','ผู้อำนวยการอาวุโส ฝ่ายธุรการ','016/2556','dept_head','active','https://drive.google.com/thumbnail?id=1H8G7vxHEMDWqO8bK9GuvKlGVXshrtLTc&sz=w1000','ธุรการ'),
  ('pornpan@irdp.org','พรพรรณ สุเมธีวรคุณ','โอ๋','063-889-9894','027145587','ผู้ชำนาญการธุรการ 4','023/2556','employee','active','https://drive.google.com/thumbnail?id=1qQq72TG4c2s153Mzp08tV3MW1JOR30Vi&sz=w1000','ธุรการ'),
  ('maytika@irdp.org','เมธิกา พงษ์เพชร','เฟิร์น','094-263-5453','027145598','ผู้ชำนาญการธุรการ 3','012/2555','employee','active','https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/sj3LZRcJTxYR6dtMwjFE/pub/UzCjK3y6WNwoBySFdAOm.jpg','ธุรการ'),
  ('arnon@irdp.org','อานนท์ แย้มโชติ','นนท์','062-452-6251','027145585','รองผู้จัดการ','065/2560','admin','active','https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/sj3LZRcJTxYR6dtMwjFE/pub/vCCy7doXgCSJ2Bls7uy1.jpg','ธุรการ'),
  ('patcharanan@irdp.org','พัชรนันท์ พันธุ์สวัสดิ์','แพท','092-267-7744','027145576','นักบัญชีอาวุโส','098/2565','employee','active','https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/sj3LZRcJTxYR6dtMwjFE/pub/Sp5eylZDvBJzXvbsfEBg.png','ธุรการ'),
  ('chotika@irdp.org','โชติกา ลาสอน','เฟิน','096-479-2656','027145599','เจ้าหน้าที่ธุรการ','119/2568','employee','active','https://drive.google.com/thumbnail?id=17fFQAbw7FbhGwadqjUEjDK26SDttUuMJ&sz=w1000','ธุรการ'),
  ('supat@irdp.org','สุพัฒน์ ผาเลิศ','พัฒน์','098-250-5618',null,'แม่บ้าน','C03/2565','employee','active','https://drive.google.com/thumbnail?id=1r3t5x-Rhb-VAYOoHtFs_kwP1seVIMLnh&sz=w1000','ธุรการ'),
  ('napat@irdp.org','นภัส คูณยินดี','น้อย','097-140-9246',null,'แม่บ้าน','C016/2565','employee','active','https://drive.google.com/thumbnail?id=1F2v9yUupn98UiS3P64pXOlydQbuirdfq&sz=w1000','ธุรการ'),
  ('somchit@irdp.org','สมจิตร อินทอง','สมจิตร','087-015-1150',null,'พนักงานขับรถ','C018/2565','employee','active','https://drive.google.com/thumbnail?id=1clqAp5dztx6Xv0dHqNCH2hhWSccBV0_w&sz=w1000','ธุรการ')
) as v(email, full_name, nickname, phone, desk_phone, position, employee_code, role, status, avatar_url, dept)
on conflict (email) do update set
  full_name     = excluded.full_name,
  nickname      = excluded.nickname,
  phone         = excluded.phone,
  desk_phone    = excluded.desk_phone,
  position      = excluded.position,
  employee_code = excluded.employee_code,
  role          = excluded.role,
  status        = excluded.status,
  avatar_url    = excluded.avatar_url,
  department_id = excluded.department_id;

-- ตรวจสอบผล
select count(*) as total, count(department_id) as with_dept from employees;
select d.name, count(e.id) from departments d
  left join employees e on e.department_id = d.id
  group by d.name order by d.name;
