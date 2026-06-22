"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { notify } from "@/lib/notify";
import {
  computeLeaveHours,
  leaveDateRangeToTimestamps,
  leaveRequestSchema,
  LEAVE_LABELS_TH,
  type LeaveRequestInput,
} from "@/lib/leave";

async function notifyDeptHeads(departmentId: string | null, title: string, body: string, link: string) {
  if (!departmentId) return;
  const supabase = await createClient();
  const { data: heads } = await supabase
    .from("employee_directory")
    .select("id")
    .eq("department_id", departmentId)
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
    dayPart: formData.get("dayPart"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    reason: formData.get("reason") || undefined,
  };
  const parsed = leaveRequestSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const submit = formData.get("submit") === "true";
  const supabase = await createClient();
  const hours = await computeLeaveHours(supabase, parsed.data);
  const { startAt, endAt } = leaveDateRangeToTimestamps(
    parsed.data.startDate,
    parsed.data.endDate,
    parsed.data.dayPart
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
      status: submit ? "submitted" : "draft",
    })
    .select("id")
    .single();

  if (error || !row) return { error: error?.message ?? "บันทึกคำขอลาไม่สำเร็จ" };

  const file = formData.get("certFile");
  if (file instanceof File && file.size > 0) {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${employee.id}/${row.id}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("leave-certs").upload(path, file, {
      contentType: file.type,
      upsert: true,
    });
    if (!uploadError) {
      await supabase.from("leave_requests").update({ cert_url: path }).eq("id", row.id);
    }
  }

  if (submit) {
    await notifyDeptHeads(
      employee.department_id,
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
    dayPart: formData.get("dayPart"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    reason: formData.get("reason") || undefined,
  };
  const parsed = leaveRequestSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const submit = formData.get("submit") === "true";
  const supabase = await createClient();
  const hours = await computeLeaveHours(supabase, parsed.data);
  const { startAt, endAt } = leaveDateRangeToTimestamps(
    parsed.data.startDate,
    parsed.data.endDate,
    parsed.data.dayPart
  );

  // RLS (leave_update) only allows this while status is draft/returned — the
  // DB rejects it otherwise, so no extra status check needed here.
  const { error } = await supabase
    .from("leave_requests")
    .update({
      leave_code: parsed.data.leaveCode,
      start_at: startAt,
      end_at: endAt,
      hours,
      reason: parsed.data.reason ?? null,
      status: submit ? "submitted" : "draft",
    })
    .eq("id", id);

  if (error) return { error: error.message };

  if (submit) {
    await notifyDeptHeads(
      employee.department_id,
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
