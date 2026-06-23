import { eachDayOfInterval, format, isWeekend, parseISO } from "date-fns";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";

const TZ = "Asia/Bangkok";
export const WORK_START = "08:30";
export const WORK_END = "17:00";
const LUNCH_START = "12:00";
const LUNCH_END = "13:00";
const FULL_DAY_HOURS = 7.5;

export const leaveRequestSchema = z
  .object({
    leaveCode: z.enum(["sick", "personal", "vacation"]),
    startDate: z.string().min(1, "กรุณาเลือกวันที่เริ่ม"),
    endDate: z.string().min(1, "กรุณาเลือกวันที่สิ้นสุด"),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "รูปแบบเวลาไม่ถูกต้อง"),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "รูปแบบเวลาไม่ถูกต้อง"),
    reason: z.string().max(500).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม",
    path: ["endDate"],
  })
  .refine((v) => v.startTime >= WORK_START && v.startTime <= WORK_END, {
    message: `เวลาเริ่มต้องอยู่ระหว่าง ${WORK_START}-${WORK_END}`,
    path: ["startTime"],
  })
  .refine((v) => v.endTime >= WORK_START && v.endTime <= WORK_END, {
    message: `เวลาสิ้นสุดต้องอยู่ระหว่าง ${WORK_START}-${WORK_END}`,
    path: ["endTime"],
  })
  .refine((v) => v.startDate !== v.endDate || v.endTime > v.startTime, {
    message: "เวลาสิ้นสุดต้องหลังเวลาเริ่ม",
    path: ["endTime"],
  });

export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;

function toUtcIso(dateStr: string, timeStr: string): string {
  return fromZonedTime(`${dateStr}T${timeStr}:00`, TZ).toISOString();
}

/** Picked date(s) + time(s) map straight onto start_at/end_at — no more
 * day-part branching, the literal picked times are the timestamps. */
export function leaveDateRangeToTimestamps(
  startDate: string,
  endDate: string,
  startTime: string,
  endTime: string
): { startAt: string; endAt: string } {
  return { startAt: toUtcIso(startDate, startTime), endAt: toUtcIso(endDate, endTime) };
}

function minutesOfDay(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

const WORK_START_MIN = minutesOfDay(WORK_START);
const WORK_END_MIN = minutesOfDay(WORK_END);
const LUNCH_START_MIN = minutesOfDay(LUNCH_START);
const LUNCH_END_MIN = minutesOfDay(LUNCH_END);

/** Hours within a single day's [startTime, endTime) window, clamped to
 * 08:30-17:00 and with any 12:00-13:00 lunch overlap subtracted — same
 * lunch-deduction shape as fn_compute_ot in 0003_business_logic.sql,
 * reimplemented separately here since OT and leave are different concerns. */
function singleDayHours(startTime: string, endTime: string): number {
  const s = Math.max(minutesOfDay(startTime), WORK_START_MIN);
  const e = Math.min(minutesOfDay(endTime), WORK_END_MIN);
  const gross = Math.max(0, e - s);
  const lunchOverlap = Math.max(0, Math.min(e, LUNCH_END_MIN) - Math.max(s, LUNCH_START_MIN));
  return Math.max(0, gross - lunchOverlap) / 60;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Single source of truth for "how many hours does this request cost" — the
 * DB only auto-computes balances/quotas (leave_balance_view,
 * fn_recompute_leave_balance), never the hours of one new request, so this
 * stays app-side per the schema's own design (see leave_requests.hours
 * comment in 0001_init.sql).
 *
 * Per IRDP_System_Architecture.md §6.1, leave is free-form hours within
 * 08:30-17:00, not restricted to fixed full/half-day shapes. For a
 * multi-day range, the first and last day use the picked start/end time
 * (always counted, even if that day happens to land on a weekend — the
 * user deliberately picked a time on it); any days in between are
 * automatically full days (7.5h), excluding weekends and
 * calendar_events(type='holiday') — confirmed with the user rather than
 * counting every calendar day.
 */
export async function computeLeaveHours(
  supabase: SupabaseClient<Database>,
  { startDate, endDate, startTime, endTime }: { startDate: string; endDate: string; startTime: string; endTime: string }
): Promise<number> {
  if (startDate === endDate) {
    return round2(singleDayHours(startTime, endTime));
  }

  const firstDayHours = singleDayHours(startTime, WORK_END);
  const lastDayHours = singleDayHours(WORK_START, endTime);

  const allDays = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) });
  const middleDays = allDays.slice(1, -1).filter((d) => !isWeekend(d));

  let middleHours = 0;
  if (middleDays.length > 0) {
    const { data: holidays } = await supabase
      .from("calendar_events")
      .select("start_at")
      .eq("type", "holiday")
      .gte("start_at", toUtcIso(startDate, "00:00"))
      .lte("start_at", toUtcIso(endDate, "23:59"));

    const holidayDates = new Set(
      (holidays ?? []).map((h) => formatInTimeZone(new Date(h.start_at), TZ, "yyyy-MM-dd"))
    );
    const workingMiddleDays = middleDays.filter((d) => !holidayDates.has(format(d, "yyyy-MM-dd")));
    middleHours = workingMiddleDays.length * FULL_DAY_HOURS;
  }

  return round2(firstDayHours + middleHours + lastDayHours);
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
  rejected: "ปฏิเสธ",
  returned: "ตีกลับให้แก้ไข",
  cancelled: "ยกเลิกแล้ว",
};
