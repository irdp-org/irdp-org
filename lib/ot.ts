import { fromZonedTime } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";

const TZ = "Asia/Bangkok";

export const fieldRequestSchema = z
  .object({
    type: z.enum(["offsite", "wfh"]),
    locationId: z.string().optional(),
    workDate: z.string().min(1, "กรุณาเลือกวันที่"),
    plannedStart: z.string().optional(),
    plannedEnd: z.string().optional(),
    reason: z.string().max(500).optional(),
  })
  .refine((v) => v.type !== "offsite" || !!v.locationId, {
    message: "กรุณาเลือกสถานที่",
    path: ["locationId"],
  })
  .refine((v) => v.type !== "offsite" || !!v.plannedStart, {
    message: "กรุณากรอกเวลาเข้างาน",
    path: ["plannedStart"],
  })
  .refine((v) => v.type !== "offsite" || !!v.plannedEnd, {
    message: "กรุณากรอกเวลาออกงาน",
    path: ["plannedEnd"],
  })
  .refine((v) => !v.plannedStart || !v.plannedEnd || v.plannedEnd > v.plannedStart, {
    message: "เวลาออกงานต้องหลังเวลาเข้างาน",
    path: ["plannedEnd"],
  });

export type FieldRequestInput = z.infer<typeof fieldRequestSchema>;

/** workDate + a "HH:mm" time -> UTC ISO timestamp in Asia/Bangkok, same
 * shape as lib/leave.ts's toUtcIso. */
export function fieldTimeToIso(workDate: string, time: string): string {
  return fromZonedTime(`${workDate}T${time}:00`, TZ).toISOString();
}

export type OtPreview = Database["public"]["Functions"]["fn_compute_ot"]["Returns"];

/** Read-only preview before submit — the actual row's OT fields are filled
 * automatically by the fn_field_autofill trigger on insert/update, this
 * RPC call never writes anything. */
export async function previewOtHours(
  supabase: SupabaseClient<Database>,
  employeeId: string,
  workDate: string,
  plannedStart: string,
  plannedEnd: string
): Promise<OtPreview | null> {
  const { data, error } = await supabase.rpc("fn_compute_ot", {
    p_emp: employeeId,
    p_date: workDate,
    p_start: fieldTimeToIso(workDate, plannedStart),
    p_end: fieldTimeToIso(workDate, plannedEnd),
  });
  if (error) return null;
  return data;
}

export type WeeklyOtSummary = Database["public"]["Functions"]["fn_weekly_ot_summary"]["Returns"];

export async function previewWeeklyOt(
  supabase: SupabaseClient<Database>,
  employeeId: string,
  workDate: string
): Promise<WeeklyOtSummary | null> {
  const { data, error } = await supabase.rpc("fn_weekly_ot_summary", {
    p_emp: employeeId,
    p_date: workDate,
  });
  if (error) return null;
  return data;
}

export async function checkWfhConflict(
  supabase: SupabaseClient<Database>,
  employeeId: string,
  workDate: string
): Promise<boolean> {
  const { data } = await supabase
    .from("field_requests")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("type", "wfh")
    .eq("status", "approved")
    .eq("work_date", workDate)
    .maybeSingle();
  return !!data;
}

export const FIELD_TYPE_LABELS_TH: Record<"offsite" | "wfh", string> = {
  offsite: "นอกสถานที่",
  wfh: "Work from Anywhere (WFH)",
};

export const FIELD_STATUS_LABELS_TH: Record<
  Database["public"]["Enums"]["request_status_t"],
  string
> = {
  draft: "ฉบับร่าง",
  submitted: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธ",
  returned: "ตีกลับให้แก้ไข",
  cancelled: "ยกเลิกแล้ว",
};

export const OT_TYPE_LABELS_TH: Record<Database["public"]["Enums"]["ot_type_t"], string> = {
  weekday_ot: "OT วันทำงาน (×1.5)",
  holiday_normal: "ทำงานวันหยุดในเวลา (×1)",
  holiday_ot: "ทำงานวันหยุดเกินเวลา (×3)",
};
