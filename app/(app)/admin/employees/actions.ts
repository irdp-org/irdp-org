"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { canEdit } from "@/lib/rbac";

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
  birthdate: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

function parseForm(formData: FormData) {
  return employeeSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    nickname: formData.get("nickname") || undefined,
    departmentId: formData.get("departmentId"),
    role: formData.get("role"),
    position: formData.get("position") || undefined,
    hireDate: formData.get("hireDate") || undefined,
    phone: formData.get("phone") || undefined,
    birthdate: formData.get("birthdate") || undefined,
    status: formData.get("status") || undefined,
  });
}

export async function createEmployee(formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee || !canEdit(employee.role)) return { error: "unauthorized" };

  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const supabase = await createClient();
  // RLS (emp_insert) already requires can_edit() — matches the check above.
  const { error } = await supabase.from("employees").insert({
    email: parsed.data.email.toLowerCase(),
    full_name: parsed.data.fullName,
    nickname: parsed.data.nickname || null,
    department_id: parsed.data.departmentId,
    role: parsed.data.role,
    position: parsed.data.position || null,
    hire_date: parsed.data.hireDate || null,
    phone: parsed.data.phone || null,
    birthdate: parsed.data.birthdate || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/employees");
  return { ok: true };
}

export async function updateEmployee(id: string, formData: FormData) {
  const employee = await getCurrentEmployee();
  if (!employee || !canEdit(employee.role)) return { error: "unauthorized" };

  const parsed = parseForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };

  const supabase = await createClient();
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
      birthdate: parsed.data.birthdate || null,
      status: parsed.data.status ?? "active",
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
