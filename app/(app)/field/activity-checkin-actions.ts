"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import type { TrainingHistoryEntry } from "@/lib/database.types";

/**
 * Employee checks in to an org calendar activity. Only allowed once the
 * event has actually started — recorded on activity_checkins, but the
 * work-log entry and training-history entry aren't written until check-out
 * (see checkOutActivity), since only then is the actual duration known.
 */
export async function checkInActivity(calendarEventId: string, locationText: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const supabase = await createClient();

  const { data: event } = await supabase
    .from("calendar_events")
    .select("id, title, start_at, end_at, location, scope")
    .eq("id", calendarEventId)
    .single();
  if (!event || event.scope !== "org") return { error: "ไม่พบกิจกรรม" };

  const now0 = new Date();
  if (now0 < new Date(event.start_at)) return { error: "ยังไม่ถึงเวลาเริ่มกิจกรรม เช็คอินไม่ได้" };
  if (event.end_at && now0 > new Date(event.end_at)) return { error: "กิจกรรมนี้สิ้นสุดไปแล้ว เช็คอินไม่ได้" };

  const location = locationText.trim() || event.location || null;

  const { error: ciError } = await supabase.from("activity_checkins").insert({
    calendar_event_id: calendarEventId,
    employee_id: employee.id,
    location,
  });
  if (ciError) {
    if (ciError.code === "23505") return { error: "คุณเช็คอินกิจกรรมนี้ไปแล้ว" };
    return { error: ciError.message };
  }

  revalidatePath("/checkin");
  return { ok: true };
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
    await supabase
      .from("employees")
      .update({ training_history: [...current, entry] })
      .eq("id", employee.id);
  }

  revalidatePath("/checkin");
  revalidatePath("/worklog");
  revalidatePath("/profile");
  return { ok: true };
}
