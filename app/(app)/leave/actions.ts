"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee, type Employee } from "@/lib/auth";
import { notify } from "@/lib/notify";
import {
  computeLeaveHours,
  leaveDateRangeToTimestamps,
  leaveRequestSchema,
  LEAVE_LABELS_TH,
  type LeaveRequestInput,
} from "@/lib/leave";

// Matches leave-certs' allowed_mime_types exactly (0002_storage.sql).
const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

function guessContentType(ext: string): string {
  return EXT_TO_MIME[ext.toLowerCase()] ?? "application/octet-stream";
}

// สุประภาดา โชติมณี is the sole member of "สำนักกรรมการผู้จัดการ" — no
// dept_head role exists in that department, so (like every other dept_head)
// nobody actually sits above her to approve. Her leave, and every active
// dept_head's own leave, skips the approve step entirely and goes straight
// to the existing exec-acknowledge flow (วรภัทร/เสรี/คณิตา รับทราบ แทนอนุมัติ)
// instead of waiting on an approve click that structurally can't come from
// within their own department.
const NO_APPROVER_EMPLOYEE_ID = "1821971f-61bb-4e3d-bd5c-e38190cf7d13";
function needsNoApproval(employee: Employee): boolean {
  return (employee.role === "dept_head" && employee.status === "active") || employee.id === NO_APPROVER_EMPLOYEE_ID;
}

// admin/hr have no dept_head above them — nobody would ever be found by the
// normal department_id+dept_head lookup, so their own submissions silently
// reached zero recipients. Instead, notify all execs directly as an FYI;
// the approval mechanics are unchanged (admin can still self-approve; hr
// cannot approve anything per enforce_request_rules(), so an admin or exec
// approves hr's own leave — already mechanically possible today).
async function notifySubmission(submitter: Employee, title: string, body: string, link: string) {
  const supabase = await createClient();

  if (submitter.role === "admin" || submitter.role === "hr") {
    const { data: execs } = await supabase.from("employee_directory").select("id").eq("role", "exec");
    await Promise.allSettled(
      (execs ?? []).map((e) =>
        notify({ userId: e.id, type: "leave_submitted_no_head", title, body, link })
      )
    );
    return;
  }

  if (!submitter.department_id) return;
  const { data: heads } = await supabase
    .from("employee_directory")
    .select("id")
    .eq("department_id", submitter.department_id)
    .eq("role", "dept_head");

  await Promise.allSettled(
    (heads ?? []).map((h) => notify({ userId: h.id, type: "leave_submitted", title, body, link }))
  );
}

export async function previewLeaveHours(input: LeaveRequestInput) {
  const parsed = leaveRequestSchema.safeParse(input);
  if (!parsed.success) return { hours: 0, error: parsed.error.issues[0]?.message };

  const employee = await getCurrentEmployee();
  if (!employee) return { hours: 0, error: "unauthorized" };

  const supabase = await createClient();
  const hours = await computeLeaveHours(supabase, parsed.data);

  const year = new Date(parsed.data.startDate).getFullYear();
  const { data: balance } = await supabase
    .from("leave_balance_view")
    .select("available_hours, available_days")
    .eq("employee_id", employee.id)
    .eq("year", year)
    .eq("leave_code", parsed.data.leaveCode)
    .maybeSingle();

  return { hours, balance: balance ?? null };
}

export async function createLeaveRequest(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const raw = {
    leaveCode: formData.get("leaveCode"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    reason: formData.get("reason") || undefined,
  };
  const parsed = leaveRequestSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const submit = formData.get("submit") === "true";
  const autoApprove = submit && needsNoApproval(employee);
  const supabase = await createClient();
  const hours = await computeLeaveHours(supabase, parsed.data);
  const { startAt, endAt } = leaveDateRangeToTimestamps(
    parsed.data.startDate,
    parsed.data.endDate,
    parsed.data.startTime,
    parsed.data.endTime
  );

  const { data: row, error } = await supabase
    .from("leave_requests")
    .insert({
      employee_id: employee.id,
      leave_code: parsed.data.leaveCode,
      start_at: startAt,
      end_at: endAt,
      hours,
      reason: parsed.data.reason ?? null,
      status: autoApprove ? "approved" : submit ? "submitted" : "draft",
      decided_at: autoApprove ? new Date().toISOString() : null,
    })
    .select("id, employee_id, leave_code, hours, start_at, end_at")
    .single();

  if (error || !row) return { error: error?.message ?? "บันทึกคำขอลาไม่สำเร็จ" };

  if (autoApprove) {
    const { runPostApprovalSideEffects } = await import("./approval-actions");
    await runPostApprovalSideEffects(row);
  }

  const file = formData.get("certFile");
  if (file instanceof File && file.size > 0) {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${employee.id}/${row.id}.${ext}`;
    // service_role — storage.buckets has RLS enabled with zero policies
    // (external misconfiguration, not fixable via SQL editor/dashboard),
    // which blocks the Storage API's own internal bucket-metadata read for
    // any non-service-role request regardless of the objects policy. Same
    // fix as profile avatar uploads and admin/employees/actions.ts.
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage.from("leave-certs").upload(path, file, {
      // iOS Safari can report an empty/unreliable file.type for some photo
      // picker selections — fall back to extension-based guessing so the
      // upload doesn't get rejected by the bucket's allowed_mime_types.
      contentType: file.type || guessContentType(ext),
      upsert: true,
    });
    if (!uploadError) {
      await supabase.from("leave_requests").update({ cert_url: path }).eq("id", row.id);
    }
  }

  if (submit && !autoApprove) {
    await notifySubmission(
      employee,
      "มีคำขอลาใหม่รออนุมัติ",
      `${employee.full_name} ยื่นขอ${LEAVE_LABELS_TH[parsed.data.leaveCode]} ${hours} ชม.`,
      "/leave?tab=approvals"
    );
  }

  revalidatePath("/leave");
  return { ok: true, id: row.id };
}

export async function updateLeaveRequest(id: string, formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const raw = {
    leaveCode: formData.get("leaveCode"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    reason: formData.get("reason") || undefined,
  };
  const parsed = leaveRequestSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const today2 = new Date().toISOString().slice(0, 10);
  if (parsed.data.startDate < today2 && employee.role !== "hr" && employee.role !== "admin") {
    return { error: "ไม่สามารถยื่นลาย้อนหลังได้ กรุณาเลือกวันที่ตั้งแต่วันนี้เป็นต้นไป" };
  }

  const submit = formData.get("submit") === "true";
  const autoApprove = submit && needsNoApproval(employee);
  const supabase = await createClient();
  const hours = await computeLeaveHours(supabase, parsed.data);
  const { startAt, endAt } = leaveDateRangeToTimestamps(
    parsed.data.startDate,
    parsed.data.endDate,
    parsed.data.startTime,
    parsed.data.endTime
  );

  // RLS (leave_update) only allows this while status is draft/returned — the
  // DB rejects it otherwise, so no extra status check needed here. The
  // autoApprove branch goes straight to "approved", which enforce_request_rules()
  // only permits from role dept_head/admin/exec — สุประภาดา is a plain
  // "employee", so that update has to go through the admin client (service
  // role has no current_role_t(), which the trigger treats as unrestricted)
  // rather than her own session.
  const client = autoApprove ? createAdminClient() : supabase;
  const { error } = await client
    .from("leave_requests")
    .update({
      leave_code: parsed.data.leaveCode,
      start_at: startAt,
      end_at: endAt,
      hours,
      reason: parsed.data.reason ?? null,
      status: autoApprove ? "approved" : submit ? "submitted" : "draft",
      decided_at: autoApprove ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  if (autoApprove) {
    const { runPostApprovalSideEffects } = await import("./approval-actions");
    await runPostApprovalSideEffects({
      id,
      employee_id: employee.id,
      leave_code: parsed.data.leaveCode,
      hours,
      start_at: startAt,
      end_at: endAt,
    });
  } else if (submit) {
    await notifySubmission(
      employee,
      "มีคำขอลาแก้ไขแล้วรออนุมัติ",
      `${employee.full_name} ยื่นขอ${LEAVE_LABELS_TH[parsed.data.leaveCode]} ${hours} ชม. อีกครั้ง`,
      "/leave?tab=approvals"
    );
  }

  revalidatePath("/leave");
  return { ok: true };
}

export async function cancelLeaveRequest(id: string) {
  const supabase = await createClient();
  // RLS (leave_update, after 0004) + enforce_request_rules() validate who
  // can do this and lock it down to a pure status change.
  const { error } = await supabase.from("leave_requests").update({ status: "cancelled" }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/leave");
  return { ok: true };
}

// ── Leave document (item 6) ──────────────────────────────────────────────────
export async function generateLeaveDoc(id: string, sendEmail: boolean) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };
  const templateId = process.env.DOC_TEMPLATE_LEAVE;
  if (!templateId) return { error: "ยังไม่ได้ตั้งค่าแม่แบบใบลา (DOC_TEMPLATE_LEAVE)" };

  const { generateDocFromTemplate, stampSignatureAtMarker, docIdFromUrl } = await import("@/lib/google-docs");
  const { dLabel, deptHeadName, deptNameOf, emailDocIfRequested } = await import("@/lib/doc-gen");
  const { createAdminClient } = await import("@/lib/supabase/admin");

  const supabase = await createClient();
  const { data: r } = await supabase
    .from("leave_requests")
    .select("employee_id, leave_code, start_at, end_at, hours, reason, created_at, status, generated_doc_url")
    .eq("id", id)
    .single();
  if (!r) return { error: "ไม่พบคำขอลา" };

  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("full_name, position, signature_url").eq("id", r.employee_id).single();

  // Approver signature is looked up fresh every time regardless of caching —
  // a request can go from unapproved to approved *after* the doc was first
  // generated, so re-stamping on the same cached doc (below) still needs the
  // current state, not whatever was true the first time someone clicked.
  let approverSignatureUrl: string | null = null;
  if (r.status === "approved") {
    const { data: appr } = await admin
      .from("approvals")
      .select("actor_id")
      .eq("entity", "leave_requests")
      .eq("entity_id", id)
      .eq("action", "approve")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (appr) {
      const { data: approver } = await admin.from("employees").select("signature_url").eq("id", appr.actor_id).single();
      approverSignatureUrl = approver?.signature_url ?? null;
    }
  }

  // Reuse the doc already generated for this request instead of creating a
  // new copy every time someone clicks "ออกเอกสาร" again — same pattern as
  // van/room bookings (generateVanDoc/generateRoomDoc).
  if (r.generated_doc_url) {
    const cachedDocId = docIdFromUrl(r.generated_doc_url);
    if (cachedDocId) {
      if (emp?.signature_url) await stampSignatureAtMarker(cachedDocId, "{{ลายเซ็นผู้ยื่น}}", emp.signature_url);
      if (approverSignatureUrl) await stampSignatureAtMarker(cachedDocId, "{{ลายเซ็นผู้อนุมัติ}}", approverSignatureUrl);
    }
    await emailDocIfRequested(sendEmail, r.employee_id, `ใบลา ${dLabel(r.start_at)}`, r.generated_doc_url);
    return { ok: true, url: r.generated_doc_url };
  }

  const days = (r.hours / 7.5).toFixed(1).replace(/\.0$/, "");
  const { getOrCreateDatedFolder } = await import("@/lib/google-drive");
  const folderId = await getOrCreateDatedFolder("ใบลา", r.start_at.slice(0, 10), emp?.full_name ?? "ไม่ระบุชื่อ");
  const { url } = await generateDocFromTemplate(
    templateId,
    `ใบลา-${dLabel(r.start_at)}-${emp?.full_name ?? ""}`,
    {
    ผู้ลา: emp?.full_name ?? "",
    ชื่อ: emp?.full_name ?? "",
    ตำแหน่ง: emp?.position ?? "",
    ฝ่าย: await deptNameOf(r.employee_id),
    ประเภทการลา: LEAVE_LABELS_TH[r.leave_code],
    วันที่เริ่ม: dLabel(r.start_at),
    วันที่สิ้นสุด: dLabel(r.end_at),
    จำนวนวัน: days,
    เหตุผล: r.reason ?? "",
    วันที่: dLabel(r.created_at),
    หัวหน้าฝ่าย: await deptHeadName(r.employee_id),
    },
    folderId
  );

  const leaveDocId = docIdFromUrl(url);
  if (leaveDocId) {
    if (emp?.signature_url) await stampSignatureAtMarker(leaveDocId, "{{ลายเซ็นผู้ยื่น}}", emp.signature_url);
    if (approverSignatureUrl) await stampSignatureAtMarker(leaveDocId, "{{ลายเซ็นผู้อนุมัติ}}", approverSignatureUrl);
  }

  await admin.from("leave_requests").update({ generated_doc_url: url }).eq("id", id);
  await emailDocIfRequested(sendEmail, r.employee_id, `ใบลา ${dLabel(r.start_at)}`, url);
  return { ok: true, url };
}
