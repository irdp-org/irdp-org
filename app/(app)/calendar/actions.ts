"use server";

import { revalidatePath } from "next/cache";
import { fromZonedTime } from "date-fns-tz";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { canEdit } from "@/lib/rbac";
import type { Database } from "@/lib/database.types";

const TZ = "Asia/Bangkok";
type CalType = Database["public"]["Enums"]["cal_type_t"];

function parseForm(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const type = String(formData.get("type") ?? "") as CalType;
  const description = (String(formData.get("description") ?? "").trim() || null) as string | null;
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? startDate);
  const allDay = formData.get("allDay") === "true";
  const startTime = String(formData.get("startTime") ?? "09:00");
  const endTime = String(formData.get("endTime") ?? "10:00");

  if (!title || !startDate) return { error: "กรอกชื่อกิจกรรมและวันที่ให้ครบ" } as const;

  const startAt = allDay
    ? fromZonedTime(`${startDate}T00:00:00`, TZ).toISOString()
    : fromZonedTime(`${startDate}T${startTime}:00`, TZ).toISOString();
  const endAt = allDay
    ? fromZonedTime(`${endDate}T23:59:59`, TZ).toISOString()
    : fromZonedTime(`${endDate}T${endTime}:00`, TZ).toISOString();

  return { ok: true, title, type, description, startAt, endAt, allDay } as const;
}

export async function createOrgEvent(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee || !canEdit(employee.role)) return { error: "unauthorized" };

  const parsed = parseForm(formData);
  if ("error" in parsed) return parsed;

  const supabase = await createClient();
  const { error } = await supabase.from("calendar_events").insert({
    title: parsed.title,
    description: parsed.description,
    type: parsed.type,
    scope: "org",
    start_at: parsed.startAt,
    end_at: parsed.endAt,
    all_day: parsed.allDay,
    owner_id: employee.id,
    source_module: "manual",
  });
  // Google push happens here once lib/google-calendar.ts lands (step E).

  if (error) return { error: error.message };
  revalidatePath("/calendar");
  return { ok: true };
}

export async function updateOrgEvent(id: string, formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee || !canEdit(employee.role)) return { error: "unauthorized" };

  const parsed = parseForm(formData);
  if ("error" in parsed) return parsed;

  const supabase = await createClient();
  const { error } = await supabase
    .from("calendar_events")
    .update({
      title: parsed.title,
      description: parsed.description,
      type: parsed.type,
      start_at: parsed.startAt,
      end_at: parsed.endAt,
      all_day: parsed.allDay,
    })
    .eq("id", id)
    .eq("scope", "org");
  // Google push (update) happens here once lib/google-calendar.ts lands (step E).

  if (error) return { error: error.message };
  revalidatePath("/calendar");
  return { ok: true };
}

export async function deleteOrgEvent(id: string) {
  const employee = await getCurrentEmployee();
  if (!employee || !canEdit(employee.role)) return { error: "unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase.from("calendar_events").delete().eq("id", id).eq("scope", "org");
  // Google push (delete) happens here once lib/google-calendar.ts lands (step E).

  if (error) return { error: error.message };
  revalidatePath("/calendar");
  return { ok: true };
}
