"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";

function guessContentType(ext: string): string {
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext.toLowerCase()] ?? "application/octet-stream";
}

/** Smart-search: reuse an existing sub-category within this department (case-
 * insensitive label match) or create it on first use, so everyone in the
 * department converges on the same tabs instead of duplicating near-same names. */
async function getOrCreateCategoryId(label: string, departmentId: string, employeeId: string): Promise<string | null> {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("document_categories")
    .select("id")
    .eq("department_id", departmentId)
    .ilike("label", trimmed)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await admin
    .from("document_categories")
    .insert({ department_id: departmentId, label: trimmed, created_by: employeeId })
    .select("id")
    .single();
  if (error || !created) return null;
  return created.id;
}

/** Smart-search: reuse an existing "ถึง" recipient (org-wide, case-insensitive)
 * or create it on first use, shared across every department. */
async function getOrCreateRecipient(name: string, employeeId: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("document_recipients")
    .select("name")
    .ilike("name", trimmed)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.name;
  await admin.from("document_recipients").insert({ name: trimmed, created_by: employeeId });
  return trimmed;
}

async function uploadAttachment(file: File, deptName: string, yearBe: number) {
  const { getOrCreatePath, uploadToDrive } = await import("@/lib/google-drive");
  const folderId = await getOrCreatePath(["ออกเลขเอกสาร", deptName, String(yearBe)]);
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
  const up = await uploadToDrive(buffer, `${Date.now()}-${file.name}`, file.type || guessContentType(ext), folderId);
  return { driveId: up.id, url: up.webViewLink };
}

export async function createDocumentNumber(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };
  if (!employee.department_id) return { error: "บัญชีนี้ยังไม่ได้กำหนดฝ่าย ติดต่อ HR" };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "กรุณากรอกชื่อเรื่อง" };
  const issuedDate = String(formData.get("issuedDate") ?? "") || new Date().toISOString().slice(0, 10);
  const yearBe = new Date(issuedDate).getFullYear() + 543;
  const recipientInput = String(formData.get("recipient") ?? "").trim();
  const categoryInput = String(formData.get("category") ?? "").trim();

  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: dept } = await admin.from("departments").select("name").eq("id", employee.department_id).single();
  const deptName = dept?.name ?? "ไม่ระบุฝ่าย";

  const categoryId = categoryInput ? await getOrCreateCategoryId(categoryInput, employee.department_id, employee.id) : null;
  const recipient = recipientInput ? await getOrCreateRecipient(recipientInput, employee.id) : null;
  let categoryCode: string | null = null;
  if (categoryId) {
    const { data: cat } = await admin.from("document_categories").select("code, label").eq("id", categoryId).single();
    categoryCode = cat?.code ?? cat?.label ?? null;
  }

  const { data: seq, error: seqErr } = await supabase.rpc("fn_next_docnum_seq", {
    p_department_id: employee.department_id,
    p_year: yearBe,
    p_category_id: categoryId,
  });
  if (seqErr || seq == null) return { error: seqErr?.message ?? "ออกเลขไม่สำเร็จ" };
  const docNo = categoryCode
    ? `${categoryCode}/${yearBe}/${String(seq).padStart(4, "0")}`
    : `${deptName}/${yearBe}/${String(seq).padStart(3, "0")}`;

  let attachmentDriveId: string | null = null;
  let attachmentUrl: string | null = null;
  const file = formData.get("attachment");
  if (file instanceof File && file.size > 0) {
    try {
      const up = await uploadAttachment(file, deptName, yearBe);
      attachmentDriveId = up.driveId;
      attachmentUrl = up.url;
    } catch (err) {
      console.error("[document-numbers] attachment upload failed", err);
      return { error: "แนบไฟล์ไม่สำเร็จ (ตรวจสอบสิทธิ์ Drive)" };
    }
  }

  const { data: row, error } = await supabase
    .from("document_numbers")
    .insert({
      department_id: employee.department_id,
      category_id: categoryId,
      year_be: yearBe,
      seq,
      doc_no: docNo,
      title,
      recipient,
      issued_date: issuedDate,
      issued_by: employee.id,
      attachment_drive_id: attachmentDriveId,
      attachment_url: attachmentUrl,
    })
    .select("id")
    .single();

  if (error || !row) return { error: error?.message ?? "บันทึกไม่สำเร็จ" };

  revalidatePath("/document-numbers");
  return { ok: true, id: row.id, docNo };
}

export async function updateDocumentNumber(id: string, formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "กรุณากรอกชื่อเรื่อง" };
  const issuedDate = String(formData.get("issuedDate") ?? "") || undefined;
  const recipientInput = String(formData.get("recipient") ?? "").trim();

  const supabase = await createClient();

  const update: {
    title: string;
    recipient?: string | null;
    issued_date?: string;
    attachment_drive_id?: string;
    attachment_url?: string;
  } = { title, recipient: recipientInput ? await getOrCreateRecipient(recipientInput, employee.id) : null };
  if (issuedDate) update.issued_date = issuedDate;

  const file = formData.get("attachment");
  if (file instanceof File && file.size > 0) {
    const admin = createAdminClient();
    const { data: existing } = await supabase
      .from("document_numbers")
      .select("department_id, year_be")
      .eq("id", id)
      .single();
    if (!existing) return { error: "ไม่พบเอกสาร" };
    const { data: dept } = await admin.from("departments").select("name").eq("id", existing.department_id).single();
    try {
      const up = await uploadAttachment(file, dept?.name ?? "ไม่ระบุฝ่าย", existing.year_be);
      update.attachment_drive_id = up.driveId;
      update.attachment_url = up.url;
    } catch (err) {
      console.error("[document-numbers] attachment upload failed", err);
      return { error: "แนบไฟล์ไม่สำเร็จ (ตรวจสอบสิทธิ์ Drive)" };
    }
  }

  const { error } = await supabase.from("document_numbers").update(update).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/document-numbers");
  return { ok: true };
}

export async function deleteDocumentNumber(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("document_numbers").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/document-numbers");
  return { ok: true };
}
