"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { canEdit } from "@/lib/rbac";
import { haversineDistanceMeters } from "@/lib/geo";
import type { TrainingHistoryEntry } from "@/lib/database.types";

export type ActivityCheckinMode = "online" | "onsite";

/**
 * Employee checks in to an org calendar activity. Only allowed once the
 * event has actually started — recorded on activity_checkins, but the
 * work-log entry and training-history entry aren't written until check-out
 * (see checkOutActivity), since only then is the actual duration known.
 *
 * mode "onsite" verifies GPS against the HQ work_location (never trust a
 * client-computed distance — recomputed here); mode "online" skips GPS
 * entirely. Like offsite field check-ins, being outside the radius is
 * recorded (within_radius) but doesn't block the check-in.
 */
export async function checkInActivity(
  calendarEventId: string,
  params: { mode: ActivityCheckinMode; lat?: number; lng?: number }
) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const supabase = await createClient();

  const { data: event } = await supabase
    .from("calendar_events")
    .select("id, title, start_at, end_at, location, scope")
    .eq("id", calendarEventId)
    .single();
  if (!event || event.scope !== "org") return { error: "ไม่พบกิจกรรม" };

  // Check-in retroactively is allowed (e.g. forgot to tap in during the
  // event) — only block checking in before the event has even started.
  if (new Date() < new Date(event.start_at)) return { error: "ยังไม่ถึงเวลาเริ่มกิจกรรม เช็คอินไม่ได้" };

  let location: string | null;
  let workLocationId: string | null = null;
  let distanceM: number | null = null;
  let withinRadius: boolean | null = null;

  if (params.mode === "onsite") {
    if (params.lat == null || params.lng == null) return { error: "กรุณาขอตำแหน่ง GPS ก่อน" };
    const admin = createAdminClient();
    const { data: hq } = await admin.from("work_locations").select("id, name, lat, lng, radius_m").eq("is_hq", true).maybeSingle();
    if (!hq) return { error: "ยังไม่ได้ตั้งค่าสำนักงานใหญ่สำหรับเช็คอิน onsite" };
    workLocationId = hq.id;
    location = hq.name;
    distanceM = haversineDistanceMeters(params.lat, params.lng, hq.lat, hq.lng);
    withinRadius = distanceM <= hq.radius_m;
  } else {
    location = "ออนไลน์ (Zoom Meeting)";
  }

  const { error: ciError } = await supabase.from("activity_checkins").insert({
    calendar_event_id: calendarEventId,
    employee_id: employee.id,
    location,
    work_location_id: workLocationId,
    lat: params.lat ?? null,
    lng: params.lng ?? null,
    distance_m: distanceM,
    within_radius: withinRadius,
  });
  if (ciError) {
    if (ciError.code === "23505") return { error: "คุณเช็คอินกิจกรรมนี้ไปแล้ว" };
    return { error: ciError.message };
  }

  revalidatePath("/checkin");
  return { ok: true };
}

/**
 * hr/admin-only roster of who's checked in to a given activity so far —
 * the "back office" view requested alongside the self-service check-in.
 */
export async function getActivityCheckinRoster(calendarEventId: string) {
  const employee = await getCurrentEmployee();
  if (!employee || !canEdit(employee.role)) return { error: "unauthorized" } as const;

  const admin = createAdminClient();
  const { data: checkins, error } = await admin
    .from("activity_checkins")
    .select("employee_id, location, checked_in_at, checked_out_at, distance_m, within_radius")
    .eq("calendar_event_id", calendarEventId)
    .order("checked_in_at", { ascending: true });
  if (error) return { error: error.message } as const;

  const employeeIds = [...new Set((checkins ?? []).map((c) => c.employee_id))];
  const { data: employees } = employeeIds.length
    ? await admin.from("employees").select("id, full_name").in("id", employeeIds)
    : { data: [] };
  const nameById = new Map((employees ?? []).map((e) => [e.id, e.full_name]));

  const roster = (checkins ?? []).map((c) => ({
    employeeName: nameById.get(c.employee_id) ?? "—",
    location: c.location,
    checkedInAt: c.checked_in_at,
    checkedOutAt: c.checked_out_at,
    distanceM: c.distance_m,
    withinRadius: c.within_radius,
  }));

  return { ok: true, roster } as const;
}

/**
 * Check out of an activity already checked into. Only allowed once the
 * event has ended — this is when the work-log entry (full checked-in →
 * checked-out span) and, if the event is flagged training, the
 * training_history entry both get written.
 */
export async function checkOutActivity(calendarEventId: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const supabase = await createClient();

  const { data: event } = await supabase
    .from("calendar_events")
    .select("id, title, start_at, end_at, location, is_training, organizer, instructor, scope")
    .eq("id", calendarEventId)
    .single();
  if (!event || event.scope !== "org") return { error: "ไม่พบกิจกรรม" };

  if (!event.end_at || new Date() < new Date(event.end_at)) return { error: "กิจกรรมยังไม่สิ้นสุด เช็คเอ้าท์ไม่ได้" };

  // Atomic claim: the WHERE checked_out_at IS NULL means only one of any
  // concurrent/repeated clicks actually updates a row (Postgres serializes
  // concurrent UPDATEs on the same row) — the rest get 0 rows back and bail
  // out below instead of each writing their own work_logs/training_history.
  const now = new Date().toISOString();
  const { data: checkin, error: coError } = await supabase
    .from("activity_checkins")
    .update({ checked_out_at: now })
    .eq("calendar_event_id", calendarEventId)
    .eq("employee_id", employee.id)
    .is("checked_out_at", null)
    .select("id, checked_in_at, location")
    .maybeSingle();
  if (coError) return { error: coError.message };
  if (!checkin) {
    const { data: existing } = await supabase
      .from("activity_checkins")
      .select("id")
      .eq("calendar_event_id", calendarEventId)
      .eq("employee_id", employee.id)
      .maybeSingle();
    return { error: existing ? "คุณเช็คเอ้าท์ไปแล้ว" : "คุณยังไม่ได้เช็คอินกิจกรรมนี้" };
  }

  const workDate = checkin.checked_in_at.slice(0, 10);
  const startTime = checkin.checked_in_at.slice(11, 16);
  const endTime = now.slice(11, 16);
  await supabase.from("work_logs").insert({
    employee_id: employee.id,
    work_date: workDate,
    start_time: startTime,
    end_time: endTime,
    tasks: `เข้าร่วมกิจกรรม: ${event.title}${checkin.location ? ` (${checkin.location})` : ""}`,
  });

  if (event.is_training) {
    const entry: TrainingHistoryEntry = {
      name: event.title,
      organizer: event.organizer ?? "IRDP",
      instructor: event.instructor ?? undefined,
      year: String(new Date(event.start_at).getFullYear() + 543),
      note: checkin.location ? `เช็คอิน-เช็คเอ้าท์ที่ ${checkin.location}` : undefined,
    };
    const { data: emp } = await supabase.from("employees").select("training_history").eq("id", employee.id).single();
    const current = (emp?.training_history ?? []) as TrainingHistoryEntry[];
    const { error: thError } = await supabase
      .from("employees")
      .update({ training_history: [...current, entry] })
      .eq("id", employee.id);
    if (thError) console.error("[activity-checkin] training_history update failed", thError);
  }

  revalidatePath("/checkin");
  revalidatePath("/worklog");
  revalidatePath("/profile");
  return { ok: true };
}
