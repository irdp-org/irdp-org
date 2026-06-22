"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { LEAVE_LABELS_TH } from "@/lib/leave";
import type { Database } from "@/lib/database.types";

type ApprovalAction = "approve" | "reject" | "return" | "cancel";

const STATUS_MAP: Record<ApprovalAction, Database["public"]["Enums"]["request_status_t"]> = {
  approve: "approved",
  reject: "rejected",
  return: "returned",
  cancel: "cancelled",
};

const NOTIFY_TITLE: Record<ApprovalAction, string> = {
  approve: "คำขอลาได้รับการอนุมัติ",
  reject: "คำขอลาถูกตีกลับ",
  return: "คำขอลาถูกส่งกลับให้แก้ไข",
  cancel: "คำขอลาถูกยกเลิก",
};

/**
 * Approve/reject/return/cancel a leave request: updates leave_requests.status
 * (enforce_request_rules() validates the actor is allowed to) and writes the
 * matching approvals row — two sequential awaited calls, not a single atomic
 * RPC (see Phase 1 plan: low-concurrency internal tool, not worth the extra
 * schema surface). The calendar_events sync on approve is added in step D.
 */
export async function decideLeaveRequest(id: string, action: ApprovalAction, note?: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("leave_requests")
    .update({ status: STATUS_MAP[action] })
    .eq("id", id)
    .select("id, employee_id, leave_code, hours")
    .single();

  if (error || !row) return { error: error?.message ?? "ดำเนินการไม่สำเร็จ" };

  const { error: apprError } = await supabase.from("approvals").insert({
    entity: "leave_requests",
    entity_id: id,
    actor_id: employee.id,
    action,
    note: note || null,
  });
  if (apprError) return { error: apprError.message };

  if (row.employee_id !== employee.id) {
    await notify({
      userId: row.employee_id,
      type: `leave_${action}`,
      title: NOTIFY_TITLE[action],
      body: `${LEAVE_LABELS_TH[row.leave_code]} ${row.hours} ชม.${note ? ` — ${note}` : ""}`,
      link: "/leave",
    });
  }

  if (action === "approve") {
    const { data: execs } = await supabase
      .from("employee_directory")
      .select("id")
      .eq("role", "exec");
    await Promise.allSettled(
      (execs ?? []).map((e) =>
        notify({
          userId: e.id,
          type: "leave_acknowledge_pending",
          title: "มีคำขอลาที่อนุมัติแล้วรอรับทราบ",
          body: `${LEAVE_LABELS_TH[row.leave_code]} ${row.hours} ชม.`,
          link: "/leave?tab=approvals",
        })
      )
    );
  }

  revalidatePath("/leave");
  return { ok: true };
}

export async function acknowledgeLeaveRequest(id: string) {
  const employee = await getCurrentEmployee();
  if (!employee || employee.role !== "exec") return { error: "unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("approvals")
    .insert({ entity: "leave_requests", entity_id: id, actor_id: employee.id, action: "acknowledge" });

  if (error) return { error: error.message };
  revalidatePath("/leave");
  return { ok: true };
}
