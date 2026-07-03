"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee, type Employee } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { uploadToDrive } from "@/lib/google-drive";
import { ocrEnvelope } from "@/lib/gemini";

/** ฝ่ายรับเอกสาร = ฝ่ายธุรการ + admin/hr */
async function assertCanReceive(): Promise<Employee> {
  const employee = await getCurrentEmployee();
  if (!employee) throw new Error("unauthorized");
  if (["admin", "hr"].includes(employee.role)) return employee;
  if (employee.department_id) {
    const admin = createAdminClient();
    const { data: dept } = await admin.from("departments").select("name").eq("id", employee.department_id).single();
    if (dept?.name === "ธุรการ") return employee;
  }
  throw new Error("forbidden");
}

/** Upload the envelope photo to Drive + OCR it. Returns image links + the
 * extracted fields and a best-guess recipient employee match. */
export async function uploadAndOcr(formData: FormData) {
  let employee: Employee;
  try {
    employee = await assertCanReceive();
  } catch {
    return { error: "ไม่มีสิทธิ์ลงรับเอกสาร" };
  }

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "กรุณาแนบรูปหน้าซอง" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "image/jpeg";
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();

  // Drive upload
  let imageDriveId: string | null = null;
  let imageUrl: string | null = null;
  try {
    const up = await uploadToDrive(buffer, `envelope-${Date.now()}.${ext}`, mimeType);
    imageDriveId = up.id;
    imageUrl = up.webViewLink;
  } catch (err) {
    console.error("[documents] drive upload failed", err);
    return { error: "อัปโหลดรูปขึ้น Google Drive ไม่สำเร็จ (ตรวจสอบสิทธิ์ service account/โฟลเดอร์)" };
  }

  // OCR (best-effort)
  const ocr = await ocrEnvelope(buffer.toString("base64"), mimeType);

  // Suggest a matching employee by name
  let suggestedEmpId: string | null = null;
  if (ocr.recipient) {
    const admin = createAdminClient();
    const { data: emps } = await admin.from("employees").select("id, full_name").eq("status", "active");
    const needle = ocr.recipient.replace(/\s/g, "");
    const hit = (emps ?? []).find(
      (e) => needle.includes(e.full_name.replace(/\s/g, "")) || e.full_name.replace(/\s/g, "").includes(needle)
    );
    suggestedEmpId = hit?.id ?? null;
  }

  return {
    ok: true,
    imageDriveId,
    imageUrl,
    recipient: ocr.recipient,
    sender: ocr.sender,
    subject: ocr.subject,
    suggestedEmpId,
  };
}

export async function saveReceivedDocument(formData: FormData) {
  let employee: Employee;
  try {
    employee = await assertCanReceive();
  } catch {
    return { error: "ไม่มีสิทธิ์ลงรับเอกสาร" };
  }

  const recipientName = String(formData.get("recipientName") ?? "").trim() || null;
  const recipientEmpId = String(formData.get("recipientEmpId") ?? "") || null;
  const sender = String(formData.get("sender") ?? "").trim() || null;
  const subject = String(formData.get("subject") ?? "").trim() || null;
  const imageDriveId = String(formData.get("imageDriveId") ?? "") || null;
  const imageUrl = String(formData.get("imageUrl") ?? "") || null;

  const supabase = await createClient();
  const yearBe = new Date().getFullYear() + 543;

  // Atomic running number
  const { data: seq, error: seqErr } = await supabase.rpc("fn_next_doc_seq", { p_year: yearBe });
  if (seqErr || seq == null) return { error: seqErr?.message ?? "ออกเลขลงรับไม่สำเร็จ" };
  const docNo = `${yearBe}/${String(seq).padStart(2, "0")}`;

  const { data: row, error } = await supabase
    .from("received_documents")
    .insert({
      doc_no: docNo,
      year_be: yearBe,
      seq,
      recipient_name: recipientName,
      recipient_emp_id: recipientEmpId,
      sender,
      subject,
      image_drive_id: imageDriveId,
      image_url: imageUrl,
      received_by: employee.id,
    })
    .select("id")
    .single();

  if (error || !row) return { error: error?.message ?? "บันทึกไม่สำเร็จ" };

  // Notify the matched recipient
  if (recipientEmpId) {
    await notify({
      userId: recipientEmpId,
      type: "document_received",
      title: "มีเอกสารส่งถึงคุณ",
      body: `เลขลงรับ ${docNo}${sender ? ` จาก ${sender}` : ""}${subject ? ` เรื่อง ${subject}` : ""}`,
      link: "/documents",
    });
  }

  revalidatePath("/documents");
  return { ok: true, docNo };
}
