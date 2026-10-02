"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import type { TrainingHistoryEntry } from "@/lib/database.types";

/**
 * Employee checks in to an org calendar activity (e.g. an upcoming training
 * session). Records the check-in, logs it into the unified work diary
 * (work_logs) for today, and — if the activity is flagged is_training —
 * appends an entry to the employee's own training_history.
 */
export async function checkInActivity(calendarEventId: string, locationText: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const supabase = await createClient();

  const { data: event } = await supabase
    .from("calendar_events")
    .select("id, title, start_at, location, is_training, scope")
    .eq("id", calendarEventId)
    .single();
  if (!event || event.scope !== "org") return { error: "ไม่พบกิจกรรม" };

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

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toTimeString().slice(0, 5);
  await supabase.from("work_logs").insert({
    employee_id: employee.id,
    work_date: today,
    start_time: now,
    end_time: null,
    tasks: `เข้าร่วมกิจกรรม: ${event.title}${location ? ` (${location})` : ""}`,
  });

  if (event.is_training) {
    const entry: TrainingHistoryEntry = {
      name: event.title,
      organizer: "IRDP",
      year: String(new Date(event.start_at).getFullYear() + 543),
      note: location ? `เช็คอินที่ ${location}` : undefined,
    };
    const { data: emp } = await supabase.from("employees").select("training_history").eq("id", employee.id).single();
    const current = (emp?.training_history ?? []) as TrainingHistoryEntry[];
    await supabase
      .from("employees")
      .update({ training_history: [...current, entry] })
      .eq("id", employee.id);
  }

  revalidatePath("/field");
  revalidatePath("/worklog");
  revalidatePath("/profile");
  return { ok: true };
}
