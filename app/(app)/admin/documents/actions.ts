"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { canEdit } from "@/lib/rbac";

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

    const supabase = await createClient();
    const ext = file.name.split(".").pop() ?? "pdf";
    const storagePath = `${category}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9ก-๙._-]/g, "_")}`;

    const { error: uploadError } = await supabase.storage
      .from("org-docs")
      .upload(storagePath, file, { upsert: false });
    if (uploadError) return { error: uploadError.message };

    const admin = createAdminClient();
    const { error } = await admin.from("org_documents").insert({
      title,
      description,
      category,
      storage_path: storagePath,
      file_size_bytes: file.size,
      uploaded_by: employee.id,
    });
    if (error) return { error: error.message };

    revalidatePath("/org");
    revalidatePath("/admin/documents");
    return {};
  } catch {
    return { error: "ไม่มีสิทธิ์" };
  }
}

export async function deleteOrgDocument(id: string, storagePath: string) {
  try {
    await assertEditor();
    const supabase = await createClient();

    await supabase.storage.from("org-docs").remove([storagePath]);

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
