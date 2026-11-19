# เทียบระบบ NETPAPER (เดิม) กับ QMS ของ IRDP — โน้ตสำหรับพิจารณา

วันที่วิเคราะห์: 2026-11-19
สถานะ: **วิเคราะห์อย่างเดียว ยังไม่ได้แก้โค้ดหรือ migration ใดๆ**

แหล่งข้อมูล (ในโฟลเดอร์ Downloads ของ Arnon):
- คู่มือระบบ NETPAPER FOR DCC (SD-DCC-02/01, 22 หน้า, มีผล 22 ก.พ. 2553)
- คู่มือระบบ NETPAPER FOR END-USER (SD-DCC-03/01, 8 หน้า)

โค้ดที่เกี่ยวข้อง: `supabase/migrations/0045_qms_documents.sql`, `0053_qms_dar_workflow.sql`,
`app/(app)/qms/` (page, actions, dar/), `components/qms/`, `lib/qms-dar.ts`, `lib/qms/signed-cover.ts`,
`lib/google-drive.ts` (upsertStaffShortcut / removeStaffShortcut)

---

## สรุปสั้น

แกนหลัก (DAR, authority matrix, revision, Master List) ของเราเหนือกว่า NETPAPER
เพราะเดินสายเซ็นในระบบจริง (NETPAPER ให้เซ็นกระดาษก่อนแล้วพิมพ์ชื่อใส่ทีหลัง)
แต่ขาด "วงจรปลายทาง": แจกจ่ายตามวันบังคับใช้ -> เรียกคืน -> ค่อยลบ และขาด Edit ที่ไม่ขยับ revision

## ที่มีอยู่แล้ว

- ชนิดเอกสาร QM/PM/WI/FM/SD (`doc_type_code`)
- กลุ่มเอกสาร = `departments` + `process_code`
- สิทธิทบทวน/อนุมัติ = `qms_authority_matrix` (SD-DCC-01-01, 42 แถว) + DCC allowlist + QMR allowlist
- DAR workflow: ผู้จัดทำ -> ทบทวน -> อนุมัติ -> DCC ตรวจ -> QMR (มี notify, ตีกลับ, มอบหมายแทน)
- Master List (`/qms`): ค้นหา, แท็บฝ่าย, toggle ประวัติ
- Revise: running revision อัตโนมัติ, supersede ฉบับเก่า, unique index กัน active ซ้อน
- ประวัติเอกสาร (superseded) + เอกสารยกเลิก (obsolete)
- ใบปกลายเซ็นผนวก PDF อัตโนมัติ + shortcut โฟลเดอร์ Drive รายฝ่าย

## ที่ยังขาด (เรียงตามความเสี่ยงต่อการตรวจ ISO)

**ช่องโหว่จริง (ควรแก้ก่อน)**
1. **`confidentiality` ไม่ได้บังคับใช้** — เก็บ public/internal/confidential ไว้ แต่ RLS (`qmsdoc_select`)
   เป็น `status='active' or is_dcc()` และ UI ไม่กรอง -> เอกสารติดป้าย "ลับ" ทุกคนเปิดได้
2. **ไม่สน `effective_date`** — `publishDar` ตั้ง active ทันที และ `/qms` กรองแค่ status
   -> เอกสารที่ยังไม่ถึงวันบังคับใช้ก็ถูกหยิบไปใช้ได้ (ผิดหลัก ISO §7.5.3)

**ฟีเจอร์ที่ NETPAPER มี เราไม่มี**
3. แจกจ่าย/เรียกคืน (Distribution & Recall) — NETPAPER มีสถานะดาว 🟡รอแจกจ่ายตามวันบังคับใช้
   -> 🟢แจกจ่ายแล้ว -> 🔴เรียกคืนแล้ว และลบเอกสารไม่ได้ถ้ายังไม่เรียกคืน
4. Edit แยกจาก Revise — Edit = แก้คำผิด/ฟอนต์ (revision ไม่ขยับ, ต้องบันทึกสาเหตุ);
   ของเรามีแต่ทางที่ขยับ revision ทุกครั้ง
5. ใบ DAR (FM-DCC-01-02) พิมพ์ออกมาเป็นเอกสารไม่ได้ (มีแต่ trail ใน `qms_dar.steps` + ใบปกใน PDF)
6. Master List export/พิมพ์ไม่ได้ (ผู้ตรวจมักขอ)
7. ไม่มี audit log ของเอกสาร — `audit_logs` มีแต่โมดูล QMS ไม่เขียนลง (ใครเปิด/ดาวน์โหลด/แก้)
8. ไฟล์ที่ใช้บ่อย Top 10 (PM/WI และ FM/SD) — ต้องมี log การเปิดไฟล์ก่อน (ข้อ 7)
9. เอกสารประกาศใช้ล่าสุด (New/Last Update 4 อันดับ) — ข้อมูลมีครบ แค่ยังไม่ทำส่วนแสดงผล (ง่ายสุด)
10. จัดลำดับกลุ่มเอกสารเอง — `qms_documents` ไม่มี `sort_order` (ตอนนี้เรียงตามรหัส)
11. เพิ่มชนิด/กลุ่มเอกสารจากหน้าจอ — ตอนนี้ QM/PM/WI/FM/SD เป็น check constraint ต้องเขียน migration
12. SD ถูกยุบรวมกับ FM ใน `doc_type` เดิม (`LEGACY_DOC_TYPE`: SD -> "form") แยกไม่ได้ถ้ากรองด้วยฟิลด์เก่า
13. ทบทวนเอกสารประจำปี — NETPAPER ก็ไม่มี แต่ ISO อยากเห็น (`review_due_date` + cron เตือน)

## ข้ามได้

- เปลี่ยนภาพ Banner หน้า User
- เอกสารไม่ถูกควบคุม (ใบ OT, ใบเบิกค่ารักษา, คำร้องหนังสือรับรอง) — ของเราเป็นฟีเจอร์ในระบบแล้ว
- Backup + ลบไฟล์เก่า — Supabase จัดการให้

## ลำดับที่แนะนำเมื่อกลับมาพิจารณา

1. ข้อ 1 (confidentiality) และ ข้อ 2 (effective_date) — เป็นช่องโหว่ ไม่ใช่แค่ฟีเจอร์ขาด
2. ข้อ 7 (audit log) — เป็นฐานให้ข้อ 8 และตอบผู้ตรวจ
3. ข้อ 3-4 (แจกจ่าย/เรียกคืน, Edit) — วงจรหลักที่ NETPAPER ทำไว้
4. ข้อ 5-6, 9 — เอกสารสำหรับผู้ตรวจ / ปรับหน้าจอ
5. ที่เหลือตามความจำเป็น

## คำถามที่ต้องตัดสินใจก่อนลงมือ

- เอกสาร `confidential` ใครควรเห็นได้ (เฉพาะฝ่ายเจ้าของ? ระดับหัวหน้าขึ้นไป? DCC/QMR?)
- วงจรแจกจ่าย: ต้องการขั้น "แจกจ่าย" แยกจาก "ประกาศใช้" จริงไหม หรือแค่เช็ควันบังคับใช้ก็พอ
- Edit โดยไม่ขยับ revision: ใครอนุมัติได้ (DCC คนเดียว หรือต้องผ่านสายเซ็น)
