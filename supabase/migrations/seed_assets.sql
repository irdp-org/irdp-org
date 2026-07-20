-- =============================================================================
-- IRDP — Import คลังทรัพย์สิน (Notebook 62 + PC 9 + Server 2 = 73)
-- ณ 12 ม.ค. 2569 · รัน *หลัง* seed_employees.sql (ต้องมีพนักงานครบก่อน)
--
-- - category ทั้งหมด = 'hardware'
-- - note เก็บ: [Type] · Computer name · ฝ่าย · ซื้อ <วันที่ดิบ> · หมายเหตุเดิม
--   (วันที่เก็บเป็นข้อความดิบตามที่ตกลง — purchase_date เว้นว่าง)
-- - เจ้าของที่แมตช์ → status='assigned' + current_holder_id + asset_assignments
--   เจ้าของที่ไม่มีในระบบ (ศรัณย์พร/สมชาย/นงนภัส) → in_stock (ชื่ออยู่ใน note)
-- - เครื่อง "เตรียมขาย" + สำรอง IT → จับกับ อานนท์ (arnon@irdp.org)
-- - ⚠️ รันครั้งเดียวบนตารางที่ยังว่าง (ไม่มี dedup)
-- =============================================================================

with rows_in (asset_tag, name, serial, price, status, owner_email, note) as (
  values
  ('C202','HP 240 G8','5CG14929R8',24900,'assigned','nattha@irdp.org','Notebook · NATTHA · ประเมินผล · ซื้อ 2/3/2565'),
  ('C230','DELL Lattitude 5450','8QZVT74',28500,'assigned','nattha@irdp.org','Notebook · NATTHA · ประเมินผล · ซื้อ 16/01/2569'),
  ('C203','HP 240 G8','5CG14929R0',24900,'assigned','worapong@irdp.org','Notebook · WORAPONG · ประเมินผล · ซื้อ 2/3/2565 · ปุ่น'),
  ('C069','Dell Latitude 3490','2XKGXS2',26300,'assigned','bawornwan@irdp.org','Notebook · IRDP-ANT-BAWORNWAN · ประเมินผล · ซื้อ 1/16/2562 · พี่แก้วใช้เครื่องส่วนตัว'),
  ('C219','HP Probook 440 G9',null,28000,'assigned','thanongsak@irdp.org','Notebook · THANONGSAK · ประเมินผล · ซื้อ 3/30/2566'),
  ('C220','HP Probook 440 G9',null,28000,'assigned','chanchai@irdp.org','Notebook · CHANCHAI · ประเมินผล · ซื้อ 3/30/2566'),
  ('C077','LENOVO Thinkpad L13','R9-0XQNW9 20/4',26215,'assigned','peetitas@irdp.org','Notebook · NONGLUK · ประเมินผล · ซื้อ 25/02/2564 · นงลักษณ์'),
  ('C226','DELL Lattitude 5450','315XT74',28500,'assigned','peetitas@irdp.org','Notebook · PEETITAS · ประเมินผล · ซื้อ 16/01/2569'),
  ('C081','LENOVO Thinkpad L13','R9 0XQNVL 20/4',26215,'assigned','waraporn@irdp.org','Notebook · PHATTARAPHON · ประเมินผล · ซื้อ 25/02/2564 · เครื่องเก่าพี่นิก หมิวใช้'),
  ('C229','DELL Lattitude 5450','4S6XT74',28500,'assigned','phattaraphon@irdp.org','Notebook · PHATTARAPHON · ประเมินผล · ซื้อ 16/01/2569'),
  ('C204','HP 240 G8','5CG14929QT',24900,'assigned','sirinun@irdp.org','Notebook · SIRINUN · ประเมินผล · ซื้อ 2/3/2565'),
  ('C080','LENOVO Thinkpad L13','R9-0XQNVR 20/4',26215,'assigned','arnon@irdp.org','Notebook · Satit · IT · ซื้อ 25/02/2564 · ปุ๋ย สาธิตคืนแล้ว'),
  ('C225','DELL Lattitude 5450',null,28500,'assigned','satit@irdp.org','Notebook · Satit · ประเมินผล · ซื้อ 16/01/2569'),
  ('C205','HP 240 G8','5CG14929QY',24900,'assigned','arnon@irdp.org','Notebook · WATCHARA · IT · ซื้อ 2/3/2565 · พี่แคน หลิว วัชระ'),
  ('C218','HP Probook 440 G9 I7',null,32000,'assigned','khanita@irdp.org','Notebook · KHANITA · ประเมินผล · ซื้อ 3/30/2566'),
  ('C079','LENOVO Thinkpad L13','R9-0XQNV5 20/4',26215,'assigned','chattanun@irdp.org','Notebook · PEETITAS · วิจัยและพัฒนา · ซื้อ 25/02/2564 · เจ้าของ:ก้อต · ปิติทัศน์(หลิว)/สุประภาดา/ใช้หลักสูตร LEAP'),
  ('C223','DELL Lattitude 5450',null,28500,'assigned','tanakorn@irdp.org','Notebook · ประเมินผล · ซื้อ 16/01/2569'),
  ('C207','HP 240 G8','5CG14929PX',24900,'assigned','korrawee@irdp.org','Notebook · KORRAWEE · วิจัยและพัฒนา · ซื้อ 2/3/2565'),
  ('C208','HP 240 G8','5CG1378NJX',24900,'assigned','chaiyanan@irdp.org','Notebook · chaiyanan · วิจัยและพัฒนา · ซื้อ 2/3/2565 · จากโรงแรม'),
  ('C206','HP 240 G8','5CG1378N2G',24900,'assigned','chattanun@irdp.org','Notebook · chattanun · วิจัยและพัฒนา · ซื้อ 2/3/2565 · พี่จ๊อบ เกด'),
  ('C217','HP Probook 440 G9','5CD248C0FY',28000,'assigned','siripong@irdp.org','Notebook · SIRIPONG · วิจัยและพัฒนา · ซื้อ 3/30/2566'),
  ('C062','DELL Inspiron 5370','BLXYB02(25271423282)',26842,'assigned','siripong@irdp.org','Notebook · IRDP-RES-SIRIPONG · วิจัยและพัฒนา · ซื้อ 3/17/2561'),
  ('C216','HP Probook 440 G9','5CD248C0FQ',28000,'assigned','eiea-karn@irdp.org','Notebook · EIEAKARN · ฝึกอบรม · ซื้อ 3/30/2566'),
  ('C049','HP ProBook 440 G3','5CD61048HH',26643,'assigned','worapong@irdp.org','Notebook · IRDP-TNO-002 · ฝึกอบรม(ยืม) · ซื้อ 5/23/2559 · พี่นัน พี่ภายัพ พี่ปิ๋ง PEPยืม พี่ส้ม SYNERGY'),
  ('C066','DELL Inspiron 5370','2XC0902(6369115538)',26842,'assigned','arnon@irdp.org','Notebook · IRDP-TNO-CHADATAN · ฝึกอบรม(ยืม) · ซื้อ 3/17/2561 · ฝ้าย conference lsp'),
  ('C057','DELL Inspiron 5370','JVC0902(43253482898)',26842,'assigned','eiea-karn@irdp.org','Notebook · IRDP-ANT-SUWIPA · ฝึกอบรม(ยืม) · ซื้อ 3/17/2561 · สุวิภา เกด'),
  ('223','HP Probook 440 G10','5CD4060NN0',28500,'assigned','thunyathorn@irdp.org','Notebook · IRDP-NONGNAPAT · ฝึกอบรม · ซื้อ 4/26/2567 · เจ้าของ:ธัญธรณ์ · พี่เอ๋'),
  ('C063','DELL Inspiron 5370','4NC0902(10118018450)',26842,'assigned','nitchada@irdp.org','Notebook · IRDP-RES-NARA · ฝึกอบรม · ซื้อ 3/17/2561 · พี่ไผ่ พี่เอี่ยว พี่อีฟ HCM พี่อีฟยืมใช้ที่บ้าน'),
  ('C209','HP 240 G8','5CG1378NDJ',24900,'assigned','nitchada@irdp.org','Notebook · NARAPORN · ฝึกอบรม · ซื้อ 2/3/2565'),
  ('C084','LENOVO Thinkpad L13','R9-0XQNVB 20/4',26215,'assigned','arnon@irdp.org','Notebook · Sakonwan · ฝึกอบรม · ซื้อ 25/02/2564 · พี่แพร รวิน ลูกปลา'),
  ('C085','LENOVO Thinkpad L13','R9-0XQNTZ 20/4',26215,'assigned','mephatcha@irdp.org','Notebook · Parinkarn · ฝึกอบรม · ซื้อ 25/02/2564 · พี่ปู ป่าน ยืมไป กกท'),
  ('C227','DELL Lattitude 5450','CZ5XT74',28500,'assigned','mephatcha@irdp.org','Notebook · Parinkarn · ฝึกอบรม · ซื้อ 16/01/2569'),
  ('C210','HP 240 G8','5CG14929Q1',24900,'assigned','chadatan@irdp.org','Notebook · CHADATAN · ฝึกอบรม · ซื้อ 2/3/2565'),
  ('C211','HP 240 G8','5CG14929Q4',24900,'assigned','maytika@irdp.org','Notebook · MAYTIKA · ธุรการ(เลขา) · ซื้อ 2/3/2565'),
  ('C056','DELL Inspiron 5370','DTC0902(30071856530)',26842,'assigned','maytika@irdp.org','Notebook · IRDP-CEO-MAYTIKA · ธุรการ(เลขา) · ซื้อ 3/17/2561'),
  ('C201','LENOVO V14 G2','PF3FCZY7',30400,'assigned','chotika@irdp.org','Notebook · WANAPHORN · ธุรการ(เลขา) · ซื้อ 2/3/2565 · ดร.เสรี ช้อต'),
  ('222','HP Probook 440 G10',null,28500,'assigned','suprapada@irdp.org','Notebook · IRDP-SUPRAPADA · สำนักบริหาร · ซื้อ 4/26/2567'),
  ('C076','HP Pavilion 15','5CD0522GP5',23754,'assigned','warapatr@irdp.org','Notebook · WARAPATR · ผู้บริหาร · ซื้อ 2/9/2564'),
  ('C224','DELL Lattitude 5440','SNS544LTS6',29853,'assigned','seree@irdp.org','Notebook · Seree · ผู้บริหาร · ซื้อ 4/21/2568'),
  ('C221','HP EliteBook x360','5CG2482HK2',30400,'assigned','seree@irdp.org','Notebook · Seree · ผู้บริหาร · ซื้อ 8/30/2566'),
  ('C045','HP ProBook 440G2-504TX','CND50870KN',24075,'assigned','arnon@irdp.org','Notebook · IRDP-ANT-014 · เตรียมขาย · ซื้อ 9/15/2558 · พี่ปุ้ม พี่พลอย พี่กุ๊ก พี่โอ๋wfh ssd ram8'),
  ('C073','Dell Latitude 3490','HGRGXS2',26300,'assigned','arnon@irdp.org','Notebook · IRDP-ANT-002 · เตรียมขาย · ซื้อ 1/16/2562 · พี่มะตาด อีฟ พี่กอลฟ(พี่โอ๋) พี่ปู'),
  ('C071','Dell Latitude 3490','7CRGXS2',26300,'assigned','arnon@irdp.org','Notebook · IRDP-CEO-SEREE · เตรียมขาย · ซื้อ 1/16/2562 · รอเคลมอะไหล่คีย์บอร์ด เคลมแล้ว พี่แตยืมซูม'),
  ('C074','DELL Inspiron 5490','H25QPT2',26900,'assigned','thanita@irdp.org','Notebook · THANITA · ฝึกอบรม · ซื้อ 1/27/2563 · ดร.เสรี จอเสีย เปลี่ยนจอ~8500 ซ่อมแล้ว พี่อ๋อม'),
  ('C059','DELL Inspiron 5370','DWC0902(30253255058)',26842,'assigned','arnon@irdp.org','Notebook · CHATTANAN · IT · ซื้อ 3/17/2561 · พี่กุ้ง ณัฐฐา (นนท์ใช้ที่บ้าน) ก้อต'),
  ('C070','Dell Latitude 3490','CDRGXS2',26300,'assigned','arnon@irdp.org','Notebook · IRDP-TNO-NICHAPA · เตรียมขาย · ซื้อ 1/16/2562 · พี่แอน พี่เอ๋'),
  ('C053','HP ProBook 440 G3','5CD6096MHC',26643,'assigned','arnon@irdp.org','Notebook · CHAIYANAN · เตรียมขาย · ซื้อ 5/23/2559 · ram8 ssd พี่แก้ว มะตาด พี่ตี๋ พี่ก้อง'),
  ('C065','DELL Inspiron 5370','HWC0902(38960384402)',26842,'assigned','arnon@irdp.org','Notebook · IRDP-RES-KORRAWEE · IT · ซื้อ 3/17/2561 · พี่แบร์ พี่ปิ๋ง ฝน'),
  ('C060','DELL Inspiron 5370','60D0902(13082540690)',26842,'assigned','arnon@irdp.org','Notebook · IRDP-ANT-SIRINUN · IT · ซื้อ 3/17/2561 · พี่นิก พี่ตั๊ก พี่โอ๋ wfh'),
  ('C068','Dell Latitude 3490','FCRGXS2',26300,'assigned','arnon@irdp.org','Notebook · IRDP-TNO-PAWANYA · IT · ซื้อ 1/16/2562 · อ้อม BEP'),
  ('C067','DELL Inspiron 5370','5TC0902(12657597842)',26842,'assigned','arnon@irdp.org','Notebook · IRDP-ANT-THANAPORN · IT · ซื้อ 3/17/2561 · พี่โอแนน'),
  ('C072','Dell Latitude 3490','1DRGXS2',26300,'assigned','arnon@irdp.org','Notebook · IRDP-SUPITCHA · เตรียมขาย · ซื้อ 1/16/2562 · พี่นิก พิม พี่กอล์ฟ ชาร์จไม่เข้า แบตเสีย(รอซ่อม)'),
  ('C078','LENOVO Thinkpad L13','R9 0XQNVE 20/4',26215,'assigned','thawatchai@irdp.org','Notebook · SIRIBHON · ผู้บริหาร · ซื้อ 25/02/2564 · ศิริพร(หลิว)'),
  ('C075','DELL Inspiron 5490','135QPT2',26900,'assigned','chadatan@irdp.org','Notebook · CHADATAN · ฝึกอบรม · ซื้อ 1/27/2563 · พี่น้ำ พี่ธัญ'),
  ('C083','LENOVO Thinkpad L13','R9 0XQNW2 20/4',26215,'assigned','arnon@irdp.org','Notebook · CHANCHAI · IT · ซื้อ 25/02/2564 · ชาญชัย'),
  ('C058','DELL Inspiron 5370','4TC0902(10480815506)',26842,'assigned','arnon@irdp.org','Notebook · IRDP-ANT-PAWIS · IT · ซื้อ 3/17/2561 · พี่จ้อบ ธนงศักดิ์ เอื้อใช้LSP'),
  ('C082','LENOVO Thinkpad L13','R9 0XQNVF 20/4',26215,'assigned','arnon@irdp.org','Notebook · CHITTRAPOL · IT · ซื้อ 25/02/2564 · พี่มะตาด คืนแล้ว'),
  ('C086','ASUS Expertbook','LBNXCV13A59847C',27820,'assigned','arnon@irdp.org','Notebook · SEREE · IT · ซื้อ 4/22/2564 · อ.ไก่ เสรี (conference)'),
  ('C064','DELL Inspiron 5370','HTC0902(38778985874)',26842,'assigned','arnon@irdp.org','Notebook · IRDP-RES-MUSLIM · IT · ซื้อ 3/17/2561 · พั้นช์ แบร์ วชิรศิล wifi เสีย ใช้ usb wifi พี่ก้อง การกีฬา'),
  ('C055','HP ProBook 440G3','5CD5425P45',27820,'assigned','arnon@irdp.org','Notebook · IRDP-CEO-005 · เตรียมขาย · ซื้อ 5/23/2559 · อ.ไก่ อดิศักดิ์ ปุ๋ย laptop for confer ลง windows ใหม่'),
  ('C046','HP ProBook 440 G3','5CD6096MG5',26643,'assigned','arnon@irdp.org','Notebook · IRDP-PER-CHANAMOL · เตรียมขาย · ซื้อ 5/26/2559 · พีแอน พี่สอง พี่อีฟ พี่ตุ๊กตา ลง windows ใหม่'),
  ('C052','HP ProBook 440G3','2CE2291113',26643,'assigned','arnon@irdp.org','Notebook · IRDP-PER-PIYADA · IT · ซื้อ 5/23/2559 · พี่เปิ้ล อ.วรภัทร ดาว ลง windows ใหม่'),
  -- PC
  ('C043','HP Workstation Z230 SFF','SGH526RMJG',25573,'assigned','pornpan@irdp.org','PC · IRDP-GAO-001 · ธุรการ · ซื้อ 9/15/2558 · อิงจันทร์'),
  ('C040','HP CompaqElite 8300 SFF','SGH249R7XC',21293,'in_stock',null,'PC · IRDP-GAO-002 · ธุรการ · ซื้อ 1/14/2556 · อิงจันทร์ · เจ้าของ:ศรัณย์พร'),
  (null,'iMac 2021','C02GM8X6Q6W8',56603,'in_stock',null,'PC · TRAININGIRDP · ฝึกอบรม · ซื้อ 1/31/2565 · ไว้ส่วนกลาง ก้อต · เจ้าของ:นงนภัส'),
  ('C041','HP CompaqElite 8300 SFF','SGH249R7X4',21293,'assigned','thanongsak@irdp.org','PC · IRDP-ITC-001 · ประเมินผล · ซื้อ 1/14/2556 · อิงจันทร์'),
  ('C036','HP CompaqElite 8300 AIO 23','CNW2490H39',36380,'assigned','patcharanan@irdp.org','PC · IRDP-CEO-001 · ธุรการ(บัญชี) · ซื้อ 1/14/2556 · อิงจันทร์'),
  ('C037','HP CompaqElite 8300 SFF','SGH249R7W5',21293,'assigned','seree@irdp.org','PC · IRDP-CEO-002 · ผู้บริหาร · ซื้อ 1/14/2556 · อิงจันทร์'),
  ('C038','HP CompaqElite 8300 SFF','SGH249R7X2',21293,'in_stock',null,'PC · IRDP-CEO-003 · ผู้บริหาร · ซื้อ 1/14/2556 · เคียงตะวัน ใช้ conference · เจ้าของ:สมชาย'),
  ('C212','Lenovo V50a-24IMB AIO',null,22363,'assigned','seree@irdp.org','PC · ผู้บริหาร · ซื้อ 25/08/2565'),
  ('C039','HP CompaqElite 8300 SFF','SGH249R7X5',21293,'assigned','thawatchai@irdp.org','PC · IRDP-CEO-004 · ผู้บริหาร · ซื้อ 1/14/2556 · อิงจันทร์'),
  -- Server
  ('C042','HP Proliant DL 120 Gen 7','SGH326Y38N',35953,'assigned','arnon@irdp.org','SERVER · SPTHACC00001 · IT · ซื้อ 7/16/2556 · Storage Server back up ฐานข้อมูลบัญชี'),
  (null,'HP Proliant Micro Server','5C7238P4EB',null,'assigned','arnon@irdp.org','SERVER · TRUE · IT · Authen Internet บริษัท Ideo')
),
ins as (
  insert into assets (asset_tag, category, name, serial, price, status, note, current_holder_id)
  select r.asset_tag, 'hardware', r.name, r.serial, r.price, r.status::asset_status_t, r.note,
         case when r.owner_email is null then null
              else (select id from employees e where e.email = r.owner_email) end
  from rows_in r
  returning id, current_holder_id
)
insert into asset_assignments (asset_id, employee_id, assigned_by, assigned_at, accepted_at, status)
select id, current_holder_id,
       (select id from employees where email='arnon@irdp.org'),
       now(), now(), 'accepted'
from ins
where current_holder_id is not null;

-- ตรวจสอบ
select status, count(*) from assets group by status;
