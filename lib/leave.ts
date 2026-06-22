import { eachDayOfInterval, format, isWeekend, parseISO } from "date-fns";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";

export type DayPart = "full" | "half_am" | "half_pm";

export const leaveRequestSchema = z
  .object({
    leaveCode: z.enum(["sick", "personal", "vacation"]),
    dayPart: z.enum(["full", "half_am", "half_pm"]),
    startDate: z.string().min(1, "กรุณาเลือกวันที่เริ่ม"),
    endDate: z.string().min(1, "กรุณาเลือกวันที่สิ้นสุด"),
    reason: z.string().max(500).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม",
    path: ["endDate"],
  })
  .refine((v) => v.dayPart === "full" || v.startDate === v.endDate, {
    message: "ลาครึ่งวันเลือกได้แค่วันเดียว",
    path: ["endDate"],
  });

export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;

const TZ = "Asia/Bangkok";
const WORK_START = "08:30";
const WORK_END = "17:00";
const HALF_AM_END = "12:00";
const HALF_PM_START = "13:00";
const FULL_DAY_HOURS = 7.5;
const HALF_DAY_HOURS = 3.75;

function toUtcIso(dateStr: string, timeStr: string): string {
  return fromZonedTime(`${dateStr}T${timeStr}:00`, TZ).toISOString();
}

/** Maps the form's date(s) + day-part choice to the start_at/end_at
 * timestamps stored on leave_requests, per CLAUDE.md §5 (full day =
 * 08:30-17:00, half day = AM 08:30-12:00 or PM 13:00-17:00). */
export function leaveDateRangeToTimestamps(
  startDate: string,
  endDate: string,
  dayPart: DayPart
): { startAt: string; endAt: string } {
  if (dayPart === "half_am") {
    return { startAt: toUtcIso(startDate, WORK_START), endAt: toUtcIso(startDate, HALF_AM_END) };
  }
  if (dayPart === "half_pm") {
    return { startAt: toUtcIso(startDate, HALF_PM_START), endAt: toUtcIso(startDate, WORK_END) };
  }
  return { startAt: toUtcIso(startDate, WORK_START), endAt: toUtcIso(endDate, WORK_END) };
}

/**
 * Single source of truth for "how many hours does this request cost" —
 * the DB only auto-computes balances/quotas (leave_balance_view,
 * fn_recompute_leave_balance), never the hours of one new request, so this
 * stays app-side per the schema's own design (see leave_requests.hours
 * comment in 0001_init.sql). Half-day is always a fixed 3.75h. Full-day
 * multi-day ranges exclude weekends and calendar_events(type='holiday') —
 * confirmed with the user rather than counting every calendar day.
 */
export async function computeLeaveHours(
  supabase: SupabaseClient<Database>,
  { startDate, endDate, dayPart }: { startDate: string; endDate: string; dayPart: DayPart }
): Promise<number> {
  if (dayPart !== "full") return HALF_DAY_HOURS;

  const candidateDays = eachDayOfInterval({
    start: parseISO(startDate),
    end: parseISO(endDate),
  }).filter((d) => !isWeekend(d));

  if (candidateDays.length === 0) return 0;

  const { data: holidays } = await supabase
    .from("calendar_events")
    .select("start_at")
    .eq("type", "holiday")
    .gte("start_at", toUtcIso(startDate, "00:00"))
    .lte("start_at", toUtcIso(endDate, "23:59"));

  const holidayDates = new Set(
    (holidays ?? []).map((h) => formatInTimeZone(new Date(h.start_at), TZ, "yyyy-MM-dd"))
  );

  const workingDays = candidateDays.filter((d) => !holidayDates.has(format(d, "yyyy-MM-dd")));
  return workingDays.length * FULL_DAY_HOURS;
}

export const LEAVE_LABELS_TH: Record<Database["public"]["Enums"]["leave_code_t"], string> = {
  sick: "ลาป่วย",
  personal: "ลากิจ",
  vacation: "ลาพักร้อน",
};

export const LEAVE_STATUS_LABELS_TH: Record<
  Database["public"]["Enums"]["request_status_t"],
  string
> = {
  draft: "ฉบับร่าง",
  submitted: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ตีกลับ",
  returned: "ส่งกลับให้แก้ไข",
  cancelled: "ยกเลิกแล้ว",
};
