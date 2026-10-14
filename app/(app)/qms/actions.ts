"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { isAdmin } from "@/lib/rbac";
import { getOrCreatePath, uploadToDrive, deleteFromDrive } from "@/lib/google-drive";
import type { QmsDocTypeT } from "@/lib/database.types";

const ROOT_FOLDER = "IRDP_QMS_เอกสารเผยแพร่";

async function assertDcc() {
  const employee = await getCurrentEmployee();
  if (!employee) throw new Error("unauthorized");
  if (isAdmin(employee.role)) return employee;
  const admin = createAdminClient();
  const { data } = await admin.from("qms_document_controllers").select("employee_id").eq("employee_id", employee.id).maybeSingle();
  if (!data) throw new Error("ไม่มีสิทธิ์ (ต้องเป็น DCC)");
  return employee;
}

export async function uploadQmsDocument(formData: FormData) {
  try {
    const employee = await assertDcc();
    const file = formData.get("file") as File | null;
    const docCode = String(formData.get("docCode") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const docType = String(formData.get("docType") ?? "") as QmsDocTypeT;
    const departmentId = String(formData.get("departmentId") ?? "");
    const version = String(formData.get("version") ?? "").trim();
    const effectiveDate = String(formData.get("effectiveDate") ?? "");

    if (!file || file.size === 0) return { error: "กรุณาเลือกไฟล์" };
    if (!docCode) return { error: "กรุณากรอกรหัสเอกสาร" };
    if (!title) return { error: "กรุณากรอกชื่อเอกสาร" };
    if (!departmentId) return { error: "กรุณาเลือกฝ่าย" };
    if (!version) return { error: "กรุณากรอกเลขเวอร์ชัน" };
    if (!effectiveDate) return { error: "กรุณาระบุวันที่มีผลบังคับใช้" };

    const admin = createAdminClient();
    const { data: dept } = await admin.from("departments").select("name").eq("id", departmentId).single();
    if (!dept) return { error: "ไม่พบฝ่ายที่เลือก" };

    const folderId = await getOrCreatePath([ROOT_FOLDER, dept.name]);
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadToDrive(buffer, file.name, file.type || "application/octet-stream", folderId);

    const { data: existingActive } = await admin
      .from("qms_documents")
      .select("id")
      .eq("doc_code", docCode)
      .eq("status", "active")
      .maybeSingle();

    const { data: inserted, error } = await admin
      .from("qms_documents")
      .insert({
        doc_code: docCode,
        title,
        doc_type: docType,
        department_id: departmentId,
        version,
        status: "active",
        effective_date: effectiveDate,
        google_file_id: uploaded.id,
        google_view_url: uploaded.webViewLink,
        file_size_bytes: file.size,
        uploaded_by: employee.id,
      })
      .select("id")
      .single();
    if (error || !inserted) return { error: error?.message ?? "บันทึกไม่สำเร็จ" };

    if (existingActive) {
      await admin
        .from("qms_documents")
        .update({ status: "superseded", superseded_by: inserted.id })
        .eq("id", existingActive.id);
    }

    revalidatePath("/qms");
    return {};
  } catch (err) {
    console.error("[qms] upload failed", err);
    return { error: "อัปโหลดไม่สำเร็จ" };
  }
}

/** Withdraw an active document with no replacement (discontinued procedure). */
export async function obsoleteQmsDocument(id: string) {
  try {
    await assertDcc();
    const admin = createAdminClient();
    const { error } = await admin.from("qms_documents").update({ status: "obsolete" }).eq("id", id).eq("status", "active");
    if (error) return { error: error.message };
    revalidatePath("/qms");
    return {};
  } catch {
    return { error: "ไม่มีสิทธิ์" };
  }
}

/** Hard-delete — escape hatch for a mistaken upload, not normal workflow. */
export async function deleteQmsDocument(id: string, googleFileId: string) {
  try {
    await assertDcc();
    await deleteFromDrive(googleFileId);
    const admin = createAdminClient();
    const { error } = await admin.from("qms_documents").delete().eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/qms");
    return {};
  } catch {
    return { error: "ไม่มีสิทธิ์" };
  }
}

export async function addDcc(employeeId: string) {
  try {
    const employee = await getCurrentEmployee();
    if (!employee || !isAdmin(employee.role)) return { error: "ไม่มีสิทธิ์" };
    const admin = createAdminClient();
    const { error } = await admin.from("qms_document_controllers").insert({ employee_id: employeeId });
    if (error) return { error: error.message };
    revalidatePath("/qms");
    return {};
  } catch {
    return { error: "ไม่มีสิทธิ์" };
  }
}

export async function removeDcc(employeeId: string) {
  try {
    const employee = await getCurrentEmployee();
    if (!employee || !isAdmin(employee.role)) return { error: "ไม่มีสิทธิ์" };
    const admin = createAdminClient();
    const { error } = await admin.from("qms_document_controllers").delete().eq("employee_id", employeeId);
    if (error) return { error: error.message };
    revalidatePath("/qms");
    return {};
  } catch {
    return { error: "ไม่มีสิทธิ์" };
  }
}
