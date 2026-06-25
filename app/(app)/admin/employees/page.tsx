export const revalidate = 60; // employee list changes infrequently

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { canEdit } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmployeeListClient, type EmployeeRow } from "@/components/admin/EmployeeListClient";

export default async function EmployeesAdminPage() {
  const employee = await getCurrentEmployee();
  if (!employee || !canEdit(employee.role)) redirect("/");

  const supabase = await createClient();
  const [{ data: employees }, { data: departments }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, email, full_name, nickname, department_id, role, position, status, hire_date, phone, birthdate")
      .order("full_name"),
    supabase.from("departments").select("id, name").order("name"),
  ]);

  return (
    <div>
      <PageHeader title="จัดการพนักงาน" description="เพิ่ม/แก้ไขข้อมูลพนักงาน ฝ่าย และสิทธิ์" />
      <div className="px-4 md:px-6">
        <EmployeeListClient
          employees={(employees ?? []) as EmployeeRow[]}
          departments={departments ?? []}
        />
      </div>
    </div>
  );
}
