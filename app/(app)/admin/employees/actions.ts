"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { canEdit } from "@/lib/rbac";

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};
function guessContentType(ext: string): string {
  return EXT_TO_MIME[ext.toLowerCase()] ?? "application/octet-stream";
}
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // matches avatars bucket file_size_limit, 0002_storage.sql

const educationEntrySchema = z.object({
  degree: z.string().min(1),
  institution: z.string().min(1),
  year: z.string().min(1),
});

const employeeSchema = z.object({
  email: z
    .string()
    .email("อีเมลไม่ถูกต้อง")
    .refine((e) => e.toLowerCase().endsWith("@irdp.org"), "ต้องเป็นอีเมล @irdp.org เท่านั้น"),
  fullName: z.string().min(1, "กรุณากรอกชื่อ-นามสกุล"),
  nickname: z.string().optional(),
  departmentId: z.string().min(1, "กรุณาเลือกฝ่าย"),
  role: z.enum(["employee", "dept_head", "hr", "admin", "exec"]),
  position: z.string().optional(),
  hireDate: z.string().optional(),
  phone: z.string().optional(),
  deskPhone: z.string().optional(),
  address: z.string().optional(),
  birthdate: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  education: z.array(educationEntrySchema).optional(),
});

function parseForm(formData: FormData) {
  let education: unknown = [];
  try {
    education = JSON.parse(String(formData.get("education") || "[]"));
  } catch {
    education = [];
  }
  return employeeSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    nickname: formData.get("nickname") || undefined,
    departmentId: formData.get("departmentId"),
    role: formData.get("role"),
    position: formData.get("position") || undefined,
    hireDate: formData.get("hireDate") || undefined,
    phone: formData.get("phone") || undefined,
    deskPhone: formData.get("deskPhone") || undefined,
    address: formData.get("address") || undefined,
    birthdate: formData.get("birthdate") || undefined,
    status: formData.get("status") || undefined,
    education,
  });
}

async function uploadAvatarFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  targetEmployeeId: string,
  file: File
): Promise<{ path?: string; error?: string }> {
  if (file.size > MAX_AVATAR_BYTES) return { error: "ไฟล์รูปใหญ่เกินไป (จำกัด 5MB)" };
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${targetEmployeeId}/avatar.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, {
    contentType: file.type || guessContentType(ext),
    upsert: true,
  });
  if (error) return { error: error.message };
  return { path };
}

export async function createEmployee(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee || !canEdit(employee.role)) return { error: "unauthorized" };

  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const supabase = await createClient();
  // RLS (emp_insert) already requires can_edit() — matches the check above.
  const { data: row, error } = await supabase
    .from("employees")
    .insert({
      email: parsed.data.email.toLowerCase(),
      full_name: parsed.data.fullName,
      nickname: parsed.data.nickname || null,
      department_id: parsed.data.departmentId,
      role: parsed.data.role,
      position: parsed.data.position || null,
      hire_date: parsed.data.hireDate || null,
      phone: parsed.data.phone || null,
      desk_phone: parsed.data.deskPhone || null,
      address: parsed.data.address || null,
      birthdate: parsed.data.birthdate || null,
      education: parsed.data.education ?? [],
    })
    .select("id")
    .single();

  if (error || !row) return { error: error?.message ?? "บันทึกไม่สำเร็จ" };

  const avatarFile = formData.get("avatarFile");
  if (avatarFile instanceof File && avatarFile.size > 0) {
    const up = await uploadAvatarFor(supabase, row.id, avatarFile);
    if (up.error) return { error: up.error };
    if (up.path) await supabase.from("employees").update({ avatar_url: up.path }).eq("id", row.id);
  }

  revalidatePath("/admin/employees");
  return { ok: true };
}

export async function updateEmployee(id: string, formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee || !canEdit(employee.role)) return { error: "unauthorized" };

  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const supabase = await createClient();

  let avatarPath: string | undefined;
  const avatarFile = formData.get("avatarFile");
  if (avatarFile instanceof File && avatarFile.size > 0) {
    const up = await uploadAvatarFor(supabase, id, avatarFile);
    if (up.error) return { error: up.error };
    avatarPath = up.path;
  }

  // RLS (emp_update) already requires can_edit() (or self). Never a hard
  // delete here — status flips to inactive to preserve audit history.
  const { error } = await supabase
    .from("employees")
    .update({
      full_name: parsed.data.fullName,
      nickname: parsed.data.nickname || null,
      department_id: parsed.data.departmentId,
      role: parsed.data.role,
      position: parsed.data.position || null,
      hire_date: parsed.data.hireDate || null,
      phone: parsed.data.phone || null,
      desk_phone: parsed.data.deskPhone || null,
      address: parsed.data.address || null,
      birthdate: parsed.data.birthdate || null,
      education: parsed.data.education ?? [],
      status: parsed.data.status ?? "active",
      ...(avatarPath ? { avatar_url: avatarPath } : {}),
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/employees");
  return { ok: true };
}

/**
 * Force-recompute leave balances for a specific employee and year.
 * Needed when hire_date is edited — the DB trigger (migration 0014) handles
 * future edits automatically; this action provides a manual escape hatch for
 * existing rows that were set before the trigger existed.
 */
export async function recomputeLeaveBalance(employeeId: string, year?: number) {
  const actor = await getCurrentEmployee();
  if (!actor || (actor.role !== "admin" && actor.role !== "hr")) {
    return { error: "unauthorized" };
  }
  const targetYear = year ?? new Date().getFullYear();
  const admin = createAdminClient();
  const { error } = await admin.rpc("fn_recompute_leave_balance", {
    p_emp: employeeId,
    p_year: targetYear,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/employees");
  revalidatePath("/leave");
  return { ok: true };
}
