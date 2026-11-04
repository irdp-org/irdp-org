"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee, type Employee } from "@/lib/auth";
import { isAdmin } from "@/lib/rbac";
import { notify } from "@/lib/notify";
import { getOrCreatePath, uploadToDrive, downloadFromDrive } from "@/lib/google-drive";
import { buildDarSteps, resetDarSteps, stepRoleLabels } from "@/lib/qms-dar";
import { buildSignedCoverAndMerge } from "@/lib/qms/signed-cover";
import type { QmsDarStep, QmsDocTypeCodeT, QmsDocTypeT } from "@/lib/database.types";

const ROOT_FOLDER = "IRDP_QMS_เอกสารเผยแพร่";

// qms_documents.doc_type (0045) predates the QM/PM/WI/FM/SD codes used
// everywhere else in the DCC paperwork — SD has no matching legacy value,
// so it falls back to "form" there (doc_type_code on the row still says SD).
const LEGACY_DOC_TYPE: Record<QmsDocTypeCodeT, QmsDocTypeT> = {
  QM: "manual",
  PM: "procedure",
  WI: "work_instruction",
  FM: "form",
  SD: "form",
};

async function assertDcc(): Promise<Employee> {
  const employee = await getCurrentEmployee();
  if (!employee) throw new Error("unauthorized");
  if (isAdmin(employee.role)) return employee;
  const admin = createAdminClient();
  const { data } = await admin.from("qms_document_controllers").select("employee_id").eq("employee_id", employee.id).maybeSingle();
  if (!data) throw new Error("ไม่มีสิทธิ์ (ต้องเป็น DCC)");
  return employee;
}

async function isQmr(employeeId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("role").eq("id", employeeId).single();
  if (emp?.role === "admin") return true;
  const { data } = await admin.from("qms_qmr").select("employee_id").eq("employee_id", employeeId).maybeSingle();
  return !!data;
}

export async function createDar(formData: FormData) {
  try {
    const dcc = await assertDcc();
    const admin = createAdminClient();

    const actionType = String(formData.get("actionType") ?? "create") as "create" | "revise" | "cancel";
    const docCode = String(formData.get("docCode") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const docTypeCode = String(formData.get("docTypeCode") ?? "") as QmsDocTypeCodeT;
    const processCode = String(formData.get("processCode") ?? "").trim();
    const departmentId = String(formData.get("departmentId") ?? "") || null;
    const reason = String(formData.get("reason") ?? "").trim() || null;
    const changeSummary = String(formData.get("changeSummary") ?? "").trim() || null;
    const confidentiality = (String(formData.get("confidentiality") ?? "internal") || "internal") as "public" | "internal" | "confidential";
    const effectiveDate = String(formData.get("effectiveDate") ?? "") || null;
    const authorId = String(formData.get("authorId") ?? "");
    const reviewerId = String(formData.get("reviewerId") ?? "");
    const approverId = String(formData.get("approverId") ?? "");
    const dccCheckerId = String(formData.get("dccCheckerId") ?? "") || dcc.id;
    const qmrWaived = formData.get("qmrWaived") === "on";
    const qmrId = String(formData.get("qmrId") ?? "");
    const targetDocumentId = String(formData.get("targetDocumentId") ?? "") || null;

    if (!docCode) return { error: "กรุณากรอกรหัสเอกสาร" };
    if (!title) return { error: "กรุณากรอกชื่อเอกสาร" };
    if (actionType !== "create" && !targetDocumentId) return { error: "กรุณาเลือกเอกสารที่จะแก้ไข/ยกเลิก" };
    if (!docTypeCode) return { error: "กรุณาเลือกประเภทเอกสาร" };
    if (!processCode) return { error: "กรุณาเลือกกระบวนการ" };
    if (!authorId || !reviewerId || !approverId) return { error: "กรุณาเลือกผู้จัดทำ ผู้ทบทวน และผู้อนุมัติให้ครบ" };
    if (!qmrWaived && !qmrId) return { error: "กรุณาเลือก QMR หรือระบุว่าได้รับการยกเว้น" };

    const file = formData.get("file") as File | null;
    let sourceGoogleFileId: string | null = null;
    let sourceGoogleViewUrl: string | null = null;
    let sourceFileSize: number | null = null;
    let sourceMimeType: string | null = null;
    if (file && file.size > 0) {
      const folderId = await getOrCreatePath([ROOT_FOLDER, "DAR ระหว่างอนุมัติ", docCode]);
      const buffer = Buffer.from(await file.arrayBuffer());
      const mimeType = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
      const uploaded = await uploadToDrive(buffer, file.name, mimeType, folderId);
      sourceGoogleFileId = uploaded.id;
      sourceGoogleViewUrl = uploaded.webViewLink;
      sourceFileSize = file.size;
      sourceMimeType = mimeType;
    } else if (actionType !== "cancel") {
      return { error: "กรุณาแนบไฟล์เอกสาร" };
    }

    const empIds = [authorId, reviewerId, approverId, dccCheckerId, ...(qmrWaived ? [] : [qmrId])];
    const { data: emps } = await admin.from("employees").select("id, full_name, position").in("id", empIds);
    const empById = new Map((emps ?? []).map((e) => [e.id, e]));
    for (const id of empIds) {
      if (!empById.get(id)) return { error: "ไม่พบพนักงานที่เลือก" };
    }

    const stepInputs = [
      { role: "author" as const, employeeId: authorId },
      { role: "reviewer" as const, employeeId: reviewerId },
      { role: "approver" as const, employeeId: approverId },
      { role: "dcc" as const, employeeId: dccCheckerId },
      ...(qmrWaived ? [] : [{ role: "qmr" as const, employeeId: qmrId }]),
    ].map((s) => {
      const e = empById.get(s.employeeId)!;
      return { role: s.role, employeeId: s.employeeId, fullName: e.full_name, position: e.position ?? "" };
    });

    const steps = buildDarSteps(stepInputs);

    const { data: inserted, error } = await admin
      .from("qms_dar")
      .insert({
        action_type: actionType,
        doc_code: docCode,
        title,
        doc_type_code: docTypeCode,
        process_code: processCode,
        department_id: departmentId,
        reason,
        change_summary: changeSummary,
        confidentiality,
        qmr_waived: qmrWaived,
        qmr_waived_by: qmrWaived ? dcc.id : null,
        qmr_waived_at: qmrWaived ? new Date().toISOString() : null,
        source_google_file_id: sourceGoogleFileId,
        source_google_view_url: sourceGoogleViewUrl,
        source_file_size: sourceFileSize,
        source_mime_type: sourceMimeType,
        effective_date: effectiveDate,
        target_document_id: targetDocumentId,
        status: "pending",
        current_step: 0,
        steps,
        created_by: dcc.id,
      })
      .select("id")
      .single();
    if (error || !inserted) return { error: error?.message ?? "บันทึกไม่สำเร็จ" };

    await notifyCurrentStep(inserted.id, steps, docCode, title);

    revalidatePath("/qms/dar");
    return { ok: true, id: inserted.id };
  } catch (err) {
    console.error("[qms-dar] create failed", err);
    return { error: err instanceof Error && err.message === "ไม่มีสิทธิ์ (ต้องเป็น DCC)" ? err.message : "สร้างคำขอไม่สำเร็จ" };
  }
}

async function notifyCurrentStep(darId: string, steps: QmsDarStep[], docCode: string, title: string) {
  const current = steps.find((s) => s.status === "current");
  if (!current) return;
  await notify({
    userId: current.employee_id,
    type: "qms_dar_pending",
    title: `รอ${stepRoleLabels(current)}: ${docCode}`,
    body: title,
    link: `/qms/dar/${darId}`,
  });
}

export async function actOnDarStep(darId: string, action: "approve" | "reject", note: string) {
  try {
    const employee = await getCurrentEmployee();
    if (!employee) return { error: "unauthorized" };

    const supabase = await createClient();
    const { data: dar } = await supabase.from("qms_dar").select("*").eq("id", darId).single();
    if (!dar) return { error: "ไม่พบคำขอ" };
    if (dar.status !== "pending") return { error: "คำขอนี้ไม่ได้อยู่ระหว่างรออนุมัติแล้ว" };

    const steps = dar.steps as QmsDarStep[];
    const step = steps[dar.current_step];
    if (!step || step.employee_id !== employee.id) return { error: "ยังไม่ถึงคิวของคุณ" };
    if (step.status !== "current") return { error: "ขั้นนี้ไม่ได้อยู่ระหว่างรออนุมัติ" };

    const admin = createAdminClient();

    if (action === "reject") {
      if (!note.trim()) return { error: "กรุณาระบุเหตุผลที่ตีกลับ" };
      const resetSteps = resetDarSteps(steps);
      resetSteps[dar.current_step] = { ...resetSteps[dar.current_step], status: "rejected", acted_at: new Date().toISOString(), note };
      const { error } = await admin
        .from("qms_dar")
        .update({ status: "returned", current_step: 0, steps: resetSteps, updated_at: new Date().toISOString() })
        .eq("id", darId);
      if (error) return { error: error.message };
      await notify({
        userId: dar.created_by,
        type: "qms_dar_returned",
        title: `ถูกตีกลับ: ${dar.doc_code}`,
        body: note,
        link: `/qms/dar/${darId}`,
      });
      revalidatePath("/qms/dar");
      revalidatePath(`/qms/dar/${darId}`);
      return { ok: true };
    }

    if (!employee.signature_url) return { error: "กรุณาตั้งลายเซ็นในโปรไฟล์ของคุณก่อนอนุมัติ" };

    const nextSteps = [...steps];
    nextSteps[dar.current_step] = {
      ...step,
      status: "approved",
      acted_at: new Date().toISOString(),
      note: note || null,
      signature_url_snapshot: employee.signature_url,
    };

    const nextIndex = dar.current_step + 1;
    const isLast = nextIndex >= nextSteps.length;
    if (!isLast) nextSteps[nextIndex] = { ...nextSteps[nextIndex], status: "current" };

    let darNo: string | null = null;
    if (isLast) {
      const year = new Date().getFullYear() + 543;
      const { count } = await admin
        .from("qms_dar")
        .select("id", { count: "exact", head: true })
        .not("dar_no", "is", null)
        .like("dar_no", `DAR-${year}-%`);
      darNo = `DAR-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;
    }

    const { error } = await admin
      .from("qms_dar")
      .update({
        steps: nextSteps,
        current_step: nextIndex,
        status: isLast ? "approved" : "pending",
        dar_no: darNo,
        updated_at: new Date().toISOString(),
      })
      .eq("id", darId);
    if (error) return { error: error.message };

    if (isLast) {
      await notify({
        userId: dar.created_by,
        type: "qms_dar_approved",
        title: `อนุมัติครบแล้ว พร้อมประกาศใช้: ${dar.doc_code}`,
        body: title_or_empty(dar.title),
        link: `/qms/dar/${darId}`,
      });
    } else {
      await notifyCurrentStep(darId, nextSteps, dar.doc_code, dar.title);
    }

    revalidatePath("/qms/dar");
    revalidatePath(`/qms/dar/${darId}`);
    return { ok: true };
  } catch (err) {
    console.error("[qms-dar] act failed", err);
    return { error: "ดำเนินการไม่สำเร็จ" };
  }
}

function title_or_empty(t: string | null) {
  return t ?? "";
}

/**
 * DCC publishes a fully-approved DAR: supersedes the previous active
 * qms_documents row (if any) and creates the new one. When the uploaded
 * source file is a PDF, a certification cover page listing every sign-off
 * (name, position snapshot, timestamp, signature image) is generated and
 * prepended, and that merged file — not the raw upload — becomes the
 * published document (design doc §4, Method A). Non-PDF uploads (e.g. a
 * .docx DCC didn't get around to converting) fall back to publishing the
 * raw file as-is; the approval trail in qms_dar.steps is still the
 * authoritative record either way.
 */
export async function publishDar(darId: string) {
  try {
    const dcc = await assertDcc();
    const admin = createAdminClient();

    const { data: dar } = await admin.from("qms_dar").select("*").eq("id", darId).single();
    if (!dar) return { error: "ไม่พบคำขอ" };
    if (dar.status !== "approved") return { error: "คำขอนี้ยังไม่ได้รับการอนุมัติครบ" };
    if (dar.resulting_document_id) return { error: "ประกาศใช้ไปแล้ว" };

    if (dar.action_type === "cancel") {
      if (!dar.target_document_id) return { error: "ไม่พบเอกสารที่จะยกเลิก" };
      const { error } = await admin.from("qms_documents").update({ status: "obsolete" }).eq("id", dar.target_document_id);
      if (error) return { error: error.message };
      await admin.from("qms_dar").update({ resulting_document_id: dar.target_document_id }).eq("id", darId);
      revalidatePath("/qms");
      revalidatePath(`/qms/dar/${darId}`);
      return { ok: true };
    }

    if (!dar.source_google_file_id || !dar.source_google_view_url || !dar.department_id || !dar.effective_date) {
      return { error: "ข้อมูลเอกสารไม่ครบ (ไฟล์/ฝ่าย/วันที่มีผล)" };
    }

    const { count: priorRevisionsForVersion } = await admin
      .from("qms_documents")
      .select("id", { count: "exact", head: true })
      .eq("doc_code", dar.doc_code);
    const version = String(priorRevisionsForVersion ?? 0).padStart(2, "0");

    let publishedGoogleFileId = dar.source_google_file_id;
    let publishedGoogleViewUrl = dar.source_google_view_url;
    let publishedFileSize = dar.source_file_size;
    if (dar.source_mime_type === "application/pdf") {
      try {
        const sourceBytes = await downloadFromDrive(dar.source_google_file_id);
        const { mergedPdfBytes } = await buildSignedCoverAndMerge({
          sourcePdfBytes: sourceBytes,
          darNo: dar.dar_no,
          docCode: dar.doc_code,
          docTypeCode: dar.doc_type_code,
          processCode: dar.process_code,
          title: dar.title,
          version,
          effectiveDate: dar.effective_date,
          steps: dar.steps as QmsDarStep[],
        });
        const folderId = await getOrCreatePath([ROOT_FOLDER, "เอกสารเผยแพร่", dar.doc_code]);
        const uploaded = await uploadToDrive(mergedPdfBytes, `${dar.doc_code}_rev${version}_signed.pdf`, "application/pdf", folderId);
        publishedGoogleFileId = uploaded.id;
        publishedGoogleViewUrl = uploaded.webViewLink;
        publishedFileSize = mergedPdfBytes.length;
      } catch (err) {
        // Falls back to publishing the unsigned source — the sign-off trail
        // in qms_dar.steps is unaffected, so this degrades gracefully rather
        // than blocking the whole publish on a PDF-merge bug.
        console.error("[qms-dar] signed-cover merge failed, publishing source as-is", err);
      }
    }

    const { data: existingActive } = await admin
      .from("qms_documents")
      .select("id")
      .eq("doc_code", dar.doc_code)
      .eq("status", "active")
      .maybeSingle();

    // qms_documents enforces only one "active" row per doc_code (a partial
    // unique index, see 0045) — the old active row has to be superseded
    // *before* the new one is inserted as active, not after, or the insert
    // itself collides with the row it was about to replace.
    if (existingActive) {
      const { error: supersedeErr } = await admin.from("qms_documents").update({ status: "superseded" }).eq("id", existingActive.id);
      if (supersedeErr) return { error: supersedeErr.message };
    }

    const { data: inserted, error } = await admin
      .from("qms_documents")
      .insert({
        doc_code: dar.doc_code,
        title: dar.title,
        doc_type: LEGACY_DOC_TYPE[dar.doc_type_code],
        doc_type_code: dar.doc_type_code,
        process_code: dar.process_code,
        confidentiality: dar.confidentiality,
        dar_id: darId,
        department_id: dar.department_id,
        version,
        status: "active",
        effective_date: dar.effective_date,
        google_file_id: publishedGoogleFileId,
        google_view_url: publishedGoogleViewUrl,
        file_size_bytes: publishedFileSize,
        uploaded_by: dcc.id,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      // Roll the supersede back so a failed publish doesn't leave the org
      // with zero active copies of a document that's still in force.
      if (existingActive) await admin.from("qms_documents").update({ status: "active" }).eq("id", existingActive.id);
      return { error: error?.message ?? "ประกาศใช้ไม่สำเร็จ" };
    }

    if (existingActive) {
      await admin.from("qms_documents").update({ superseded_by: inserted.id }).eq("id", existingActive.id);
    }
    await admin.from("qms_dar").update({ resulting_document_id: inserted.id }).eq("id", darId);

    revalidatePath("/qms");
    revalidatePath("/qms/dar");
    revalidatePath(`/qms/dar/${darId}`);
    return { ok: true };
  } catch (err) {
    console.error("[qms-dar] publish failed", err);
    return { error: "ประกาศใช้ไม่สำเร็จ" };
  }
}

export async function addQmr(employeeId: string) {
  try {
    const employee = await getCurrentEmployee();
    if (!employee || !isAdmin(employee.role)) return { error: "ไม่มีสิทธิ์" };
    const admin = createAdminClient();
    const { error } = await admin.from("qms_qmr").insert({ employee_id: employeeId });
    if (error) return { error: error.message };
    revalidatePath("/qms/dar");
    return {};
  } catch {
    return { error: "ไม่มีสิทธิ์" };
  }
}

export async function removeQmr(employeeId: string) {
  try {
    const employee = await getCurrentEmployee();
    if (!employee || !isAdmin(employee.role)) return { error: "ไม่มีสิทธิ์" };
    const admin = createAdminClient();
    const { error } = await admin.from("qms_qmr").delete().eq("employee_id", employeeId);
    if (error) return { error: error.message };
    revalidatePath("/qms/dar");
    return {};
  } catch {
    return { error: "ไม่มีสิทธิ์" };
  }
}

/** Admin-only, for cleaning up test/mistaken DAR entries — not part of the
 * normal lifecycle (a real DAR that needs to go away should be returned or
 * cancelled, not deleted, so the audit trail stays intact). */
export async function deleteDar(darId: string) {
  try {
    const employee = await getCurrentEmployee();
    if (!employee || !isAdmin(employee.role)) return { error: "ไม่มีสิทธิ์" };
    const admin = createAdminClient();
    const { data: dar } = await admin.from("qms_dar").select("resulting_document_id").eq("id", darId).maybeSingle();
    if (dar?.resulting_document_id) return { error: "ใบนี้ประกาศใช้เอกสารไปแล้ว ลบไม่ได้ (เอกสารที่ประกาศใช้แล้วต้องยกเลิกผ่านขั้นตอนปกติ)" };
    const { error } = await admin.from("qms_dar").delete().eq("id", darId);
    if (error) return { error: error.message };
    revalidatePath("/qms/dar");
    return { ok: true };
  } catch {
    return { error: "ไม่มีสิทธิ์" };
  }
}

/**
 * DCC reassigns the DAR's *current* step to a stand-in (e.g. the original
 * person is on leave) instead of admin silently approving on their behalf.
 * Keeps the original assignee, who delegated it, and why on the step record
 * — the stand-in still has to actually open the file and click approve
 * themselves, so this changes *who's asked*, not the fact that someone has
 * to look at the document before it's signed off.
 */
export async function delegateDarStep(darId: string, newEmployeeId: string, reason: string) {
  try {
    const dcc = await assertDcc();
    if (!reason.trim()) return { error: "กรุณาระบุเหตุผลที่มอบหมาย" };

    const admin = createAdminClient();
    const { data: dar } = await admin.from("qms_dar").select("status, current_step, steps, doc_code, title").eq("id", darId).single();
    if (!dar) return { error: "ไม่พบคำขอ" };
    if (dar.status !== "pending") return { error: "คำขอนี้ไม่ได้อยู่ระหว่างรออนุมัติ" };

    const steps = dar.steps as QmsDarStep[];
    const step = steps[dar.current_step];
    if (!step || step.status !== "current") return { error: "ขั้นนี้ไม่ได้อยู่ระหว่างรออนุมัติ" };
    if (step.employee_id === newEmployeeId) return { error: "เลือกคนเดิมอยู่ ไม่ต้องมอบหมาย" };

    const { data: newEmp } = await admin.from("employees").select("id, full_name, position").eq("id", newEmployeeId).single();
    if (!newEmp) return { error: "ไม่พบพนักงานที่เลือก" };

    const nextSteps = [...steps];
    nextSteps[dar.current_step] = {
      ...step,
      employee_id: newEmp.id,
      full_name_snapshot: newEmp.full_name,
      position_snapshot: newEmp.position ?? "",
      delegation: {
        original_employee_id: step.employee_id,
        original_name_snapshot: step.full_name_snapshot,
        delegated_by_employee_id: dcc.id,
        delegated_by_name_snapshot: dcc.full_name,
        reason: reason.trim(),
        delegated_at: new Date().toISOString(),
      },
    };

    const { error } = await admin.from("qms_dar").update({ steps: nextSteps, updated_at: new Date().toISOString() }).eq("id", darId);
    if (error) return { error: error.message };

    await notify({
      userId: newEmp.id,
      type: "qms_dar_pending",
      title: `รอ${stepRoleLabels(nextSteps[dar.current_step])} (มอบหมายแทน): ${dar.doc_code}`,
      body: dar.title,
      link: `/qms/dar/${darId}`,
    });

    revalidatePath("/qms/dar");
    revalidatePath(`/qms/dar/${darId}`);
    return { ok: true };
  } catch (err) {
    console.error("[qms-dar] delegate failed", err);
    return { error: err instanceof Error && err.message === "ไม่มีสิทธิ์ (ต้องเป็น DCC)" ? err.message : "มอบหมายไม่สำเร็จ" };
  }
}

export { isQmr };
