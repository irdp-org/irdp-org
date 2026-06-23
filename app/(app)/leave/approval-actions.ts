"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { LEAVE_LABELS_TH } from "@/lib/leave";
import { createEvent, deleteEvent } from "@/lib/google-calendar";
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
 * schema surface).
 */
export async function decideLeaveRequest(id: string, action: ApprovalAction, note?: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("leave_requests")
    .update({ status: STATUS_MAP[action] })
    .eq("id", id)
    .select("id, employee_id, leave_code, hours, start_at, end_at")
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
    const { data: requester } = await supabase
      .from("employee_directory")
      .select("id, full_name, department_id")
      .eq("id", row.employee_id)
      .single();

    if (requester) {
      // dept_head approving someone else's leave is neither the event owner
      // nor can_edit() per cal_write RLS — admin client bypasses that
      // cleanly, same pattern as lib/notify.ts.
      const admin = createAdminClient();
      const { data: calRow } = await admin
        .from("calendar_events")
        .insert({
          title: `ลา: ${requester.full_name}`,
          type: "leave",
          scope: "personal",
          owner_id: requester.id,
          department_id: requester.department_id,
          start_at: row.start_at,
          end_at: row.end_at,
          source_module: "leave",
          source_id: row.id,
        })
        .select("id")
        .single();

      if (calRow) {
        const google = await createEvent({
          title: `ลา: ${requester.full_name}`,
          startAt: row.start_at,
          endAt: row.end_at,
          allDay: true,
        });
        if (google) {
          await admin
            .from("calendar_events")
            .update({
              google_event_id: google.id,
              google_etag: google.etag,
              last_synced_at: new Date().toISOString(),
            })
            .eq("id", calRow.id);
        }
      }
    }

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

/**
 * Cancels an already-approved leave request — admin/hr only (enforced again
 * by 0005's enforce_request_rules() trigger regardless of this UI-level
 * check, since RLS's is_oversight() already lets exec/dept_head touch an
 * approved row too). Removes the synced calendar_events row and, if it
 * reached Google, deletes that event for real rather than just hiding it.
 */
export async function adminCancelApprovedLeave(id: string, reason: string) {
  const employee = await getCurrentEmployee();
  if (!employee || (employee.role !== "admin" && employee.role !== "hr")) {
    return { error: "unauthorized" };
  }
  if (!reason.trim()) return { error: "กรุณาระบุเหตุผลที่ยกเลิก" };

  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("leave_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .select("id, employee_id, leave_code, hours")
    .single();

  if (error || !row) return { error: error?.message ?? "ยกเลิกไม่สำเร็จ" };

  const { error: apprError } = await supabase.from("approvals").insert({
    entity: "leave_requests",
    entity_id: id,
    actor_id: employee.id,
    action: "cancel",
    note: reason,
  });
  if (apprError) return { error: apprError.message };

  if (row.employee_id !== employee.id) {
    await notify({
      userId: row.employee_id,
      type: "leave_cancel",
      title: "คำขอลาที่อนุมัติแล้วถูกยกเลิก",
      body: `${LEAVE_LABELS_TH[row.leave_code]} ${row.hours} ชม. — ${reason}`,
      link: "/leave",
    });
  }

  // calendar_events write needs the admin client — same cal_write RLS gap
  // as the approve branch above (the actor here is rarely the event owner).
  const admin = createAdminClient();
  const { data: calRow } = await admin
    .from("calendar_events")
    .select("id, google_event_id")
    .eq("source_module", "leave")
    .eq("source_id", id)
    .maybeSingle();

  if (calRow) {
    await admin.from("calendar_events").delete().eq("id", calRow.id);
    if (calRow.google_event_id) {
      await deleteEvent(calRow.google_event_id);
    }
  }

  revalidatePath("/leave");
  revalidatePath("/calendar");
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
