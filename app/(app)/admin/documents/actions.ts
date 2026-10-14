"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { canEdit } from "@/lib/rbac";
import { getOrCreatePath, uploadToDrive, deleteFromDrive } from "@/lib/google-drive";

const CATEGORY_LABELS: Record<string, string> = {
  regulation: "ระเบียบ",
  directive: "คำสั่ง",
  announcement: "ประกาศ",
  founding: "เอกสารจัดตั้ง",
  tax: "ภาษี / เลขประจำตัว",
  consultant: "ที่ปรึกษาไทย",
  other: "อื่นๆ",
};

async function assertEditor() {
  const employee = await getCurrentEmployee();
  if (!employee || !canEdit(employee.role)) throw new Error("ไม่มีสิทธิ์");
  return employee;
}

export async function uploadOrgDocument(formData: FormData) {
  try {
    const employee = await assertEditor();
    const file = formData.get("file") as File | null;
    const title = String(formData.get("title") ?? "").trim();
    const category = String(formData.get("category") ?? "other");
    const description = String(formData.get("description") ?? "").trim() || null;

    if (!file || file.size === 0) return { error: "กรุณาเลือกไฟล์" };
    if (!title) return { error: "กรุณากรอกชื่อเอกสาร" };

    const folderId = await getOrCreatePath(["เอกสารองค์กร", CATEGORY_LABELS[category] ?? "อื่นๆ"]);
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadToDrive(buffer, file.name, file.type || "application/octet-stream", folderId);

    const admin = createAdminClient();
    const { error } = await admin.from("org_documents").insert({
      title,
      description,
      category,
      google_file_id: uploaded.id,
      google_view_url: uploaded.webViewLink,
      file_size_bytes: file.size,
      uploaded_by: employee.id,
    });
    if (error) return { error: error.message };

    revalidatePath("/org");
    revalidatePath("/admin/documents");
    return {};
  } catch (err) {
    console.error("[org-documents] upload failed", err);
    return { error: "อัปโหลดไม่สำเร็จ" };
  }
}

export async function deleteOrgDocument(id: string, googleFileId: string | null) {
  try {
    await assertEditor();

    if (googleFileId) await deleteFromDrive(googleFileId);

    const admin = createAdminClient();
    const { error } = await admin.from("org_documents").delete().eq("id", id);
    if (error) return { error: error.message };

    revalidatePath("/org");
    revalidatePath("/admin/documents");
    return {};
  } catch {
    return { error: "ไม่มีสิทธิ์" };
  }
}
