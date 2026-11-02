"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { isAdmin } from "@/lib/rbac";
import { canReceiveDocuments } from "@/lib/intake-permissions";

const DEPT_THURAKARN = "ec228265-ee39-4b31-98f5-364dc03d1297";

// Each register kept its own doc_no format from the original paper
// ledger — new entries must continue the exact same format, never a
// generic one, so the running numbers stay usable as real references.
const DOC_NO_TEMPLATE: Record<string, (yearGreg: number, seq: number) => string> = {
  "ส่วนรับเลขา ดร.วรภัทร": (y, s) => `IRDP${y}/${String(s).padStart(4, "0")}`,
  "ส่วนรับเลขา ดร.เสรี": (y, s) => `IRDP${y}/ser/${String(s).padStart(4, "0")}`,
  "รับเข้า ธุรการ": (y, s) => `ธก.${y}/${String(s).padStart(4, "0")}`,
};

async function assertEditor() {
  const employee = await getCurrentEmployee();
  if (!employee || !(await canReceiveDocuments(employee.department_id, employee.role))) throw new Error("ไม่มีสิทธิ์");
  return employee;
}

function guessContentType(ext: string): string {
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext.toLowerCase()] ?? "application/octet-stream";
}

async function uploadAttachment(file: File, categoryLabel: string, yearBe: number) {
  const { getOrCreatePath, uploadToDrive } = await import("@/lib/google-drive");
  const folderId = await getOrCreatePath(["ลงรับเอกสาร", categoryLabel, String(yearBe)]);
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
  const up = await uploadToDrive(buffer, `${Date.now()}-${file.name}`, file.type || guessContentType(ext), folderId);
  return { driveId: up.id, url: up.webViewLink };
}

export async function createIntakeLogEntry(categoryLabel: string, formData: FormData) {
  try {
    const employee = await assertEditor();
    const template = DOC_NO_TEMPLATE[categoryLabel];
    if (!template) return { error: "ไม่รู้จักทะเบียนนี้" };

    const refNo = String(formData.get("refNo") ?? "").trim() || null;
    const issuedDate = String(formData.get("issuedDate") ?? "");
    const sourceDate = String(formData.get("sourceDate") ?? "").trim() || null;
    const fromName = String(formData.get("fromName") ?? "").trim() || null;
    const recipient = String(formData.get("recipient") ?? "").trim() || null;
    const title = String(formData.get("title") ?? "").trim();
    const handlerId = String(formData.get("handlerId") ?? "") || employee.id;

    if (!title) return { error: "กรุณากรอกเรื่อง" };
    if (!issuedDate) return { error: "กรุณาระบุวันที่" };

    const admin = createAdminClient();
    const { data: category } = await admin.from("document_categories").select("id").eq("label", categoryLabel).single();
    if (!category) return { error: "ไม่พบทะเบียนนี้ในระบบ" };

    const yearGreg = new Date(issuedDate).getFullYear();
    const yearBe = yearGreg + 543;

    const supabase = await createClient();
    const { data: seq, error: seqErr } = await supabase.rpc("fn_next_docnum_seq", {
      p_department_id: DEPT_THURAKARN,
      p_year: yearBe,
      p_category_id: category.id,
    });
    if (seqErr || seq == null) return { error: seqErr?.message ?? "ออกเลขไม่สำเร็จ" };

    const docNo = template(yearGreg, seq);

    let attachmentDriveId: string | null = null;
    let attachmentUrl: string | null = null;
    const file = formData.get("attachment");
    if (file instanceof File && file.size > 0) {
      try {
        const up = await uploadAttachment(file, categoryLabel, yearBe);
        attachmentDriveId = up.driveId;
        attachmentUrl = up.url;
      } catch (err) {
        console.error("[intake-log] attachment upload failed", err);
        return { error: "แนบไฟล์ไม่สำเร็จ (ตรวจสอบสิทธิ์ Drive)" };
      }
    }

    const { error } = await admin.from("document_numbers").insert({
      department_id: DEPT_THURAKARN,
      category_id: category.id,
      year_be: yearBe,
      seq,
      doc_no: docNo,
      title,
      recipient,
      from_name: fromName,
      ref_no: refNo,
      issued_date: issuedDate,
      source_date: sourceDate,
      issued_by: handlerId,
      attachment_drive_id: attachmentDriveId,
      attachment_url: attachmentUrl,
    });
    if (error) return { error: error.message };

    revalidatePath("/documents");
    return { ok: true, docNo };
  } catch {
    return { error: "ไม่มีสิทธิ์" };
  }
}

export async function updateIntakeLogEntry(id: string, formData: FormData) {
  try {
    await assertEditor();
    const refNo = String(formData.get("refNo") ?? "").trim() || null;
    const issuedDate = String(formData.get("issuedDate") ?? "");
    const sourceDate = String(formData.get("sourceDate") ?? "").trim() || null;
    const fromName = String(formData.get("fromName") ?? "").trim() || null;
    const recipient = String(formData.get("recipient") ?? "").trim() || null;
    const title = String(formData.get("title") ?? "").trim();
    const handlerId = String(formData.get("handlerId") ?? "") || null;

    if (!title) return { error: "กรุณากรอกเรื่อง" };
    if (!issuedDate) return { error: "กรุณาระบุวันที่" };

    const admin = createAdminClient();

    const update: {
      title: string;
      recipient: string | null;
      from_name: string | null;
      ref_no: string | null;
      issued_date: string;
      source_date: string | null;
      issued_by?: string;
      attachment_drive_id?: string;
      attachment_url?: string;
    } = { title, recipient, from_name: fromName, ref_no: refNo, issued_date: issuedDate, source_date: sourceDate };
    if (handlerId) update.issued_by = handlerId;

    const file = formData.get("attachment");
    if (file instanceof File && file.size > 0) {
      const { data: existing } = await admin.from("document_numbers").select("category_id, year_be").eq("id", id).single();
      if (!existing) return { error: "ไม่พบรายการ" };
      const { data: category } = existing.category_id
        ? await admin.from("document_categories").select("label").eq("id", existing.category_id).single()
        : { data: null };
      try {
        const up = await uploadAttachment(file, category?.label ?? "ไม่ระบุทะเบียน", existing.year_be);
        update.attachment_drive_id = up.driveId;
        update.attachment_url = up.url;
      } catch (err) {
        console.error("[intake-log] attachment upload failed", err);
        return { error: "แนบไฟล์ไม่สำเร็จ (ตรวจสอบสิทธิ์ Drive)" };
      }
    }

    const { error } = await admin.from("document_numbers").update(update).eq("id", id);
    if (error) return { error: error.message };

    revalidatePath("/documents");
    return { ok: true };
  } catch {
    return { error: "ไม่มีสิทธิ์" };
  }
}

export async function deleteIntakeLogEntry(id: string) {
  const employee = await getCurrentEmployee();
  if (!employee || !isAdmin(employee.role)) return { error: "unauthorized" };

  const admin = createAdminClient();
  const { error } = await admin.from("document_numbers").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/documents");
  return { ok: true };
}
