"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { canEdit, isAdmin } from "@/lib/rbac";

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
  if (!employee || !canEdit(employee.role)) throw new Error("ไม่มีสิทธิ์");
  return employee;
}

export async function createIntakeLogEntry(categoryLabel: string, formData: FormData) {
  try {
    const employee = await assertEditor();
    const template = DOC_NO_TEMPLATE[categoryLabel];
    if (!template) return { error: "ไม่รู้จักทะเบียนนี้" };

    const refNo = String(formData.get("refNo") ?? "").trim() || null;
    const issuedDate = String(formData.get("issuedDate") ?? "");
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
      issued_by: handlerId,
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
    const fromName = String(formData.get("fromName") ?? "").trim() || null;
    const recipient = String(formData.get("recipient") ?? "").trim() || null;
    const title = String(formData.get("title") ?? "").trim();
    const handlerId = String(formData.get("handlerId") ?? "") || null;

    if (!title) return { error: "กรุณากรอกเรื่อง" };
    if (!issuedDate) return { error: "กรุณาระบุวันที่" };

    const admin = createAdminClient();
    const { error } = await admin
      .from("document_numbers")
      .update({
        title,
        recipient,
        from_name: fromName,
        ref_no: refNo,
        issued_date: issuedDate,
        ...(handlerId ? { issued_by: handlerId } : {}),
      })
      .eq("id", id);
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
