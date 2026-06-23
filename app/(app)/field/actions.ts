"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee, type Employee } from "@/lib/auth";
import { notify } from "@/lib/notify";
import {
  fieldRequestSchema,
  fieldTimeToIso,
  previewOtHours,
  previewWeeklyOt,
  checkWfhConflict as checkWfhConflictForDate,
  FIELD_TYPE_LABELS_TH,
  type FieldRequestInput,
} from "@/lib/ot";

// Same admin/hr-no-dept_head fallback as app/(app)/leave/actions.ts's
// notifySubmission — duplicated rather than shared since the two request
// types notify about different things and live in separate route trees.
async function notifySubmission(submitter: Employee, title: string, body: string, link: string) {
  const supabase = await createClient();

  if (submitter.role === "admin" || submitter.role === "hr") {
    const { data: execs } = await supabase.from("employee_directory").select("id").eq("role", "exec");
    await Promise.allSettled(
      (execs ?? []).map((e) =>
        notify({ userId: e.id, type: "field_submitted_no_head", title, body, link })
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
    (heads ?? []).map((h) => notify({ userId: h.id, type: "field_submitted", title, body, link }))
  );
}

export async function previewOt(input: FieldRequestInput) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };
  if (input.type !== "offsite" || !input.plannedStart || !input.plannedEnd) {
    return { ot: null, weekly: null };
  }

  const supabase = await createClient();
  const [ot, weekly] = await Promise.all([
    previewOtHours(supabase, employee.id, input.workDate, input.plannedStart, input.plannedEnd),
    previewWeeklyOt(supabase, employee.id, input.workDate),
  ]);
  return { ot, weekly };
}

export async function checkWfhConflict(workDate: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return false;
  const supabase = await createClient();
  return checkWfhConflictForDate(supabase, employee.id, workDate);
}

function buildRow(employeeId: string, parsed: FieldRequestInput, status: "draft" | "submitted") {
  const isOffsite = parsed.type === "offsite";
  return {
    employee_id: employeeId,
    type: parsed.type,
    location_id: isOffsite ? parsed.locationId! : null,
    work_date: parsed.workDate,
    planned_start: isOffsite ? fieldTimeToIso(parsed.workDate, parsed.plannedStart!) : null,
    planned_end: isOffsite ? fieldTimeToIso(parsed.workDate, parsed.plannedEnd!) : null,
    reason: parsed.reason ?? null,
    status,
    // OT fields are intentionally omitted — fn_field_autofill (trigger)
    // computes pay_x1_hours/pay_x15_hours/pay_x3_hours/ot_hours/ot_type/
    // ot_breakdown automatically on insert, and raises an exception if
    // this date already has an approved WFH request.
  };
}

function parseForm(formData: FormData) {
  return fieldRequestSchema.safeParse({
    type: formData.get("type"),
    locationId: formData.get("locationId") || undefined,
    workDate: formData.get("workDate"),
    plannedStart: formData.get("plannedStart") || undefined,
    plannedEnd: formData.get("plannedEnd") || undefined,
    reason: formData.get("reason") || undefined,
  });
}

export async function createFieldRequest(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const submit = formData.get("submit") === "true";
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("field_requests")
    .insert(buildRow(employee.id, parsed.data, submit ? "submitted" : "draft"))
    .select("id")
    .single();

  if (error || !row) return { error: error?.message ?? "บันทึกคำขอไม่สำเร็จ" };

  if (submit) {
    await notifySubmission(
      employee,
      "มีคำขอนอกสถานที่/WFH ใหม่รออนุมัติ",
      `${employee.full_name} ยื่นขอ${FIELD_TYPE_LABELS_TH[parsed.data.type]}`,
      "/field?tab=approvals"
    );
  }

  revalidatePath("/field");
  return { ok: true, id: row.id };
}

export async function updateFieldRequest(id: string, formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const submit = formData.get("submit") === "true";
  const supabase = await createClient();

  // RLS (field_update) only allows this while status is draft/returned —
  // the DB rejects it otherwise, so no extra status check needed here.
  const { error } = await supabase
    .from("field_requests")
    .update(buildRow(employee.id, parsed.data, submit ? "submitted" : "draft"))
    .eq("id", id);

  if (error) return { error: error.message };

  if (submit) {
    await notifySubmission(
      employee,
      "มีคำขอนอกสถานที่/WFH แก้ไขแล้วรออนุมัติ",
      `${employee.full_name} ยื่นขอ${FIELD_TYPE_LABELS_TH[parsed.data.type]} อีกครั้ง`,
      "/field?tab=approvals"
    );
  }

  revalidatePath("/field");
  return { ok: true };
}

export async function cancelFieldRequest(id: string) {
  const supabase = await createClient();
  // RLS (field_update, after 0006) + enforce_request_rules() validate who
  // can do this and lock it down to a pure status change.
  const { error } = await supabase.from("field_requests").update({ status: "cancelled" }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/field");
  return { ok: true };
}
