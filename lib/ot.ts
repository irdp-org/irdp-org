import { fromZonedTime } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";

const TZ = "Asia/Bangkok";

/** Longest range (in calendar days) one request may cover. */
export const MAX_RANGE_DAYS = 31;

const atNoonUtc = (key: string) => new Date(`${key}T12:00:00Z`);

/** Inclusive number of calendar days between two YYYY-MM-DD keys. */
export function dateSpanDays(start: string, end: string): number {
  return Math.round((atNoonUtc(end).getTime() - atNoonUtc(start).getTime()) / 86_400_000) + 1;
}

/** Every YYYY-MM-DD from start to end inclusive, optionally without
 * Saturdays/Sundays. A single day (no end / end == start) is always kept as
 * is, even on a weekend. */
export function expandDateRange(start: string, end: string | undefined, skipWeekends: boolean): string[] {
  if (!end || end <= start) return [start];
  const out: string[] = [];
  const d = atNoonUtc(start);
  const last = atNoonUtc(end);
  while (d <= last && out.length <= MAX_RANGE_DAYS) {
    const dow = d.getUTCDay();
    if (!skipWeekends || (dow !== 0 && dow !== 6)) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export const fieldRequestSchema = z
  .object({
    type: z.enum(["offsite", "wfh", "ot"]),
    locationId: z.string().optional(),
    locationText: z.string().max(200).optional(),
    workDate: z.string().min(1, "กรุณาเลือกวันที่"),
    /** Last day when one request covers several days (e.g. WFH 2 days). */
    endDate: z.string().optional(),
    /** For a multi-day range: skip Saturdays/Sundays. */
    skipWeekends: z.boolean().optional(),
    plannedStart: z.string().optional(),
    plannedEnd: z.string().optional(),
    reason: z.string().max(500).optional(),
  })
  .refine((v) => v.type !== "offsite" || !!v.locationId, {
    message: "กรุณาเลือกสถานที่",
    path: ["locationId"],
  })
  .refine((v) => !v.endDate || v.endDate >= v.workDate, {
    message: "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม",
    path: ["endDate"],
  })
  .refine((v) => !v.endDate || dateSpanDays(v.workDate, v.endDate) <= MAX_RANGE_DAYS, {
    message: `เลือกช่วงวันได้ไม่เกิน ${MAX_RANGE_DAYS} วันต่อครั้ง`,
    path: ["endDate"],
  })
  .refine((v) => !!v.plannedStart, {
    message: "กรุณากรอกเวลาเริ่ม",
    path: ["plannedStart"],
  })
  .refine((v) => !!v.plannedEnd, {
    message: "กรุณากรอกเวลาสิ้นสุด",
    path: ["plannedEnd"],
  })
  .refine((v) => !v.plannedStart || !v.plannedEnd || v.plannedEnd > v.plannedStart, {
    message: "เวลาสิ้นสุดต้องหลังเวลาเริ่ม",
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

export const FIELD_TYPE_LABELS_TH: Record<"offsite" | "wfh" | "ot", string> = {
  offsite: "นอกสถานที่",
  wfh: "Work from Anywhere (WFH)",
  ot: "ปฏิบัติงานนอกเวลา",
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
