"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { FIELD_TYPE_LABELS_TH } from "@/lib/ot";
import type { Database } from "@/lib/database.types";

type ApprovalAction = "approve" | "reject" | "return" | "cancel";

const STATUS_MAP: Record<ApprovalAction, Database["public"]["Enums"]["request_status_t"]> = {
  approve: "approved",
  reject: "rejected",
  return: "returned",
  cancel: "cancelled",
};

const NOTIFY_TITLE: Record<ApprovalAction, string> = {
  approve: "คำขอนอกสถานที่/WFH ได้รับการอนุมัติ",
  reject: "คำขอนอกสถานที่/WFH ถูกปฏิเสธ",
  return: "คำขอนอกสถานที่/WFH ถูกตีกลับให้แก้ไข",
  cancel: "คำขอนอกสถานที่/WFH ถูกยกเลิก",
};

/**
 * Approve/reject/return/cancel — same two-sequential-writes shape as
 * decideLeaveRequest (status update + approvals row), no single atomic RPC
 * for the same low-concurrency-internal-tool reasoning as Phase 1. Unlike
 * leave, approving a field request doesn't sync anything to the calendar.
 */
export async function decideFieldRequest(id: string, action: ApprovalAction, note?: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("field_requests")
    .update({ status: STATUS_MAP[action] })
    .eq("id", id)
    .select("id, employee_id, type, ot_hours")
    .single();

  if (error || !row) return { error: error?.message ?? "ดำเนินการไม่สำเร็จ" };

  const { error: apprError } = await supabase.from("approvals").insert({
    entity: "field_requests",
    entity_id: id,
    actor_id: employee.id,
    action,
    note: note || null,
  });
  if (apprError) return { error: apprError.message };

  if (row.employee_id !== employee.id) {
    await notify({
      userId: row.employee_id,
      type: `field_${action}`,
      title: NOTIFY_TITLE[action],
      body: `${FIELD_TYPE_LABELS_TH[row.type as "offsite" | "wfh"] ?? row.type}${
        row.ot_hours ? ` · OT ${row.ot_hours} ชม.` : ""
      }${note ? ` — ${note}` : ""}`,
      link: "/field",
    });
  }

  if (action === "approve") {
    const { data: execs } = await supabase.from("employee_directory").select("id").eq("role", "exec");
    await Promise.allSettled(
      (execs ?? []).map((e) =>
        notify({
          userId: e.id,
          type: "field_acknowledge_pending",
          title: "มีคำขอนอกสถานที่/WFH ที่อนุมัติแล้วรอรับทราบ",
          body: FIELD_TYPE_LABELS_TH[row.type as "offsite" | "wfh"] ?? row.type,
          link: "/field?tab=approvals",
        })
      )
    );
  }

  revalidatePath("/field");
  return { ok: true };
}

/**
 * Cancels an already-approved request — admin/hr only, enforced again by
 * 0005's enforce_request_rules() trigger (shared with leave_requests)
 * regardless of this UI-level check.
 */
export async function adminCancelApprovedField(id: string, reason: string) {
  const employee = await getCurrentEmployee();
  if (!employee || (employee.role !== "admin" && employee.role !== "hr")) {
    return { error: "unauthorized" };
  }
  if (!reason.trim()) return { error: "กรุณาระบุเหตุผลที่ยกเลิก" };

  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("field_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .select("id, employee_id, type, ot_hours")
    .single();

  if (error || !row) return { error: error?.message ?? "ยกเลิกไม่สำเร็จ" };

  const { error: apprError } = await supabase.from("approvals").insert({
    entity: "field_requests",
    entity_id: id,
    actor_id: employee.id,
    action: "cancel",
    note: reason,
  });
  if (apprError) return { error: apprError.message };

  if (row.employee_id !== employee.id) {
    await notify({
      userId: row.employee_id,
      type: "field_cancel",
      title: "คำขอที่อนุมัติแล้วถูกยกเลิก",
      body: `${FIELD_TYPE_LABELS_TH[row.type as "offsite" | "wfh"] ?? row.type} — ${reason}`,
      link: "/field",
    });
  }

  revalidatePath("/field");
  return { ok: true };
}

export async function acknowledgeFieldRequest(id: string) {
  const employee = await getCurrentEmployee();
  if (!employee || employee.role !== "exec") return { error: "unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("approvals")
    .insert({ entity: "field_requests", entity_id: id, actor_id: employee.id, action: "acknowledge" });

  if (error) return { error: error.message };
  revalidatePath("/field");
  return { ok: true };
}

/** Marks selected approved requests as exported (sets exported_at) and
 * returns CSV-ready rows — no real accounting system integration this
 * phase, per the kickoff. */
export async function markExported(ids: string[]) {
  const employee = await getCurrentEmployee();
  if (!employee || (employee.role !== "admin" && employee.role !== "hr")) {
    return { error: "unauthorized" };
  }
  if (!ids.length) return { error: "ไม่มีรายการที่เลือก" };

  const supabase = await createClient();
  const exportedAt = new Date().toISOString();

  const { data: rows, error } = await supabase
    .from("field_requests")
    .update({ exported_at: exportedAt })
    .in("id", ids)
    .eq("status", "approved")
    .select(
      "id, employee_id, type, work_date, planned_start, planned_end, pay_x1_hours, pay_x15_hours, pay_x3_hours, ot_hours"
    );

  if (error) return { error: error.message };
  revalidatePath("/field");
  return { ok: true, rows: rows ?? [] };
}
