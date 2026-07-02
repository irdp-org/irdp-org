import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { DocumentIntakeClient, type ReceivedDoc } from "@/components/documents/DocumentIntakeClient";

export const dynamic = "force-dynamic";

async function canReceive(deptId: string | null, role: string): Promise<boolean> {
  if (["admin", "hr"].includes(role)) return true;
  if (!deptId) return false;
  const admin = createAdminClient();
  const { data } = await admin.from("departments").select("name").eq("id", deptId).single();
  return data?.name === "ธุรการ";
}

export default async function DocumentsPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");
  if (!(await canReceive(employee.department_id, employee.role))) redirect("/");

  const supabase = await createClient();
  const [{ data: docs }, { data: emps }] = await Promise.all([
    supabase
      .from("received_documents")
      .select("id, doc_no, recipient_name, recipient_emp_id, sender, subject, image_url, received_at")
      .order("received_at", { ascending: false })
      .limit(200),
    supabase.from("employee_directory").select("id, full_name").eq("status", "active").order("full_name"),
  ]);

  const nameById = new Map((emps ?? []).map((e) => [e.id, e.full_name]));
  const rows: ReceivedDoc[] = (docs ?? []).map((d) => ({
    ...d,
    recipient_display: d.recipient_emp_id ? (nameById.get(d.recipient_emp_id) ?? d.recipient_name) : d.recipient_name,
  }));

  const employeeOptions = (emps ?? []).map((e) => ({ id: e.id, full_name: e.full_name }));

  return (
    <div>
      <PageHeader title="ลงรับเอกสาร" description="ถ่ายรูปหน้าซอง → ระบบอ่านผู้รับ/ผู้ส่ง + ออกเลขลงรับอัตโนมัติ" />
      <div className="px-4 md:px-6">
        <DocumentIntakeClient docs={rows} employees={employeeOptions} />
      </div>
    </div>
  );
}
