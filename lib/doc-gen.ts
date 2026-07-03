import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/gmail";

const TZ = "Asia/Bangkok";

export function dLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
}
export function tLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
}

/** Dept head name for an employee's department (for the approval signature). */
export async function deptHeadName(employeeId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("department_id").eq("id", employeeId).single();
  if (!emp?.department_id) return "";
  const { data: head } = await admin
    .from("employees")
    .select("full_name")
    .eq("department_id", emp.department_id)
    .eq("role", "dept_head")
    .limit(1)
    .maybeSingle();
  return head?.full_name ?? "";
}

/** Department name for an employee. */
export async function deptNameOf(employeeId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("department_id").eq("id", employeeId).single();
  if (!emp?.department_id) return "";
  const { data: dept } = await admin.from("departments").select("name").eq("id", emp.department_id).single();
  return dept?.name ?? "";
}

/** Email the generated doc link to an employee, if requested. */
export async function emailDocIfRequested(sendEmail: boolean, employeeId: string, subject: string, url: string) {
  if (!sendEmail) return;
  const admin = createAdminClient();
  const { data: emp } = await admin.from("employees").select("email, full_name").eq("id", employeeId).single();
  if (!emp?.email) return;
  await sendMail({
    to: emp.email,
    subject,
    html: `<p>เรียน ${emp.full_name}</p><p>เอกสารของคุณถูกสร้างแล้ว เปิดได้ที่ลิงก์ด้านล่าง</p><p><a href="${url}">${url}</a></p>`,
  });
}
