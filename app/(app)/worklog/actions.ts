"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";

export type WorkLogInput = {
  workDate: string; // yyyy-MM-dd, ย้อนหลังได้
  startTime: string | null; // HH:mm
  endTime: string | null; // HH:mm
  tasks: string | null;
};

function parseInput(formData: FormData): WorkLogInput | { error: string } {
  const workDate = formData.get("workDate");
  if (typeof workDate !== "string" || !workDate) return { error: "กรุณาเลือกวันที่" };
  const startTime = (formData.get("startTime") as string) || null;
  const endTime = (formData.get("endTime") as string) || null;
  if (startTime && endTime && endTime <= startTime) {
    return { error: "เวลาเลิกงานต้องมากกว่าเวลาเริ่มงาน" };
  }
  const tasks = (formData.get("tasks") as string) || null;
  return { workDate, startTime, endTime, tasks };
}

export async function createWorkLog(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const parsed = parseInput(formData);
  if ("error" in parsed) return parsed;

  const supabase = await createClient();
  const { error } = await supabase.from("work_logs").insert({
    employee_id: employee.id,
    work_date: parsed.workDate,
    start_time: parsed.startTime,
    end_time: parsed.endTime,
    tasks: parsed.tasks,
  });
  if (error) return { error: error.message };

  revalidatePath("/worklog");
  return { ok: true };
}

export async function updateWorkLog(id: string, formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const parsed = parseInput(formData);
  if ("error" in parsed) return parsed;

  const supabase = await createClient();
  const { error } = await supabase
    .from("work_logs")
    .update({
      work_date: parsed.workDate,
      start_time: parsed.startTime,
      end_time: parsed.endTime,
      tasks: parsed.tasks,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/worklog");
  return { ok: true };
}

export async function deleteWorkLog(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("work_logs").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/worklog");
  return { ok: true };
}
