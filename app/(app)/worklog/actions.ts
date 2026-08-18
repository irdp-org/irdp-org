"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { isOversight, isHeadOf } from "@/lib/rbac";
import { notify } from "@/lib/notify";

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

/** Smart-search project lookup: reuse an existing project (case-insensitive,
 * trimmed match) or create it on first use — shared across the whole org so
 * everyone converges on the same spelling instead of duplicating near-same names. */
async function getOrCreateProjectId(name: string, employeeId: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("projects")
    .select("id, name")
    .ilike("name", trimmed)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created, error } = await admin
    .from("projects")
    .insert({ name: trimmed, created_by: employeeId })
    .select("id")
    .single();
  if (error || !created) return null;
  return created.id;
}

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};
function guessContentType(ext: string): string {
  return EXT_TO_MIME[ext.toLowerCase()] ?? "application/octet-stream";
}

async function uploadAttachmentIfPresent(formData: FormData, employeeName: string, workDate: string) {
  const file = formData.get("attachment");
  if (!(file instanceof File) || file.size === 0) return {};
  const { getOrCreateDatedFolder, uploadToDrive } = await import("@/lib/google-drive");
  const folderId = await getOrCreateDatedFolder("บันทึกเวลาทำงาน", workDate, employeeName);
  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const up = await uploadToDrive(buffer, `${Date.now()}-${file.name}`, file.type || guessContentType(ext), folderId);
  return { attachment_drive_id: up.id, attachment_url: up.webViewLink };
}

export async function createWorkLog(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "unauthorized" };

  const parsed = parseInput(formData);
  if ("error" in parsed) return parsed;

  const projectName = String(formData.get("projectName") ?? "").trim();
  const projectId = projectName ? await getOrCreateProjectId(projectName, employee.id) : null;

  let attachment: { attachment_drive_id?: string; attachment_url?: string } = {};
  try {
    attachment = await uploadAttachmentIfPresent(formData, employee.full_name, parsed.workDate);
  } catch (err) {
    console.error("[worklog] attachment upload failed", err);
    return { error: "แนบไฟล์ไม่สำเร็จ (ตรวจสอบสิทธิ์ Drive)" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("work_logs").insert({
    employee_id: employee.id,
    work_date: parsed.workDate,
    start_time: parsed.startTime,
    end_time: parsed.endTime,
    tasks: parsed.tasks,
    project_id: projectId,
    ...attachment,
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

  const projectName = String(formData.get("projectName") ?? "").trim();
  const projectId = projectName ? await getOrCreateProjectId(projectName, employee.id) : null;

  let attachment: { attachment_drive_id?: string; attachment_url?: string } = {};
  try {
    attachment = await uploadAttachmentIfPresent(formData, employee.full_name, parsed.workDate);
  } catch (err) {
    console.error("[worklog] attachment upload failed", err);
    return { error: "แนบไฟล์ไม่สำเร็จ (ตรวจสอบสิทธิ์ Drive)" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("work_logs")
    .update({
      work_date: parsed.workDate,
      start_time: parsed.startTime,
      end_time: parsed.endTime,
      tasks: parsed.tasks,
      project_id: projectId,
      ...attachment,
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

/** หัวหน้าฝ่าย/admin/hr/exec รับทราบ + คอมเมนต์ไดอารี่ของพนักงานคนหนึ่ง ทีละวัน. */
export async function acknowledgeDay(employeeId: string, logDate: string, comment: string) {
  const actor = await getCurrentEmployee();
  if (!actor) return { error: "unauthorized" };

  const admin = createAdminClient();
  const { data: target } = await admin.from("employees").select("department_id, full_name").eq("id", employeeId).single();
  if (!target) return { error: "ไม่พบพนักงาน" };

  const allowed = isOversight(actor.role) || isHeadOf(actor.role, actor.department_id, target.department_id);
  if (!allowed) return { error: "ไม่มีสิทธิ์" };

  const { error } = await admin
    .from("day_acknowledgements")
    .upsert(
      { employee_id: employeeId, log_date: logDate, comment: comment || null, acknowledged_by: actor.id, updated_at: new Date().toISOString() },
      { onConflict: "employee_id,log_date" }
    );
  if (error) return { error: error.message };

  if (employeeId !== actor.id) {
    await notify({
      userId: employeeId,
      type: "worklog_ack",
      title: comment ? "หัวหน้าฝ่ายคอมเมนต์บันทึกเวลาทำงานของคุณ" : "หัวหน้าฝ่ายรับทราบบันทึกเวลาทำงานของคุณ",
      body: `วันที่ ${logDate}${comment ? ` — ${comment}` : ""}`,
      link: "/worklog",
    });
  }

  revalidatePath("/worklog");
  return { ok: true };
}
