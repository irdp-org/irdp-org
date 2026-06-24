import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { AssetListClient } from "@/components/admin/AssetListClient";
import type { AssetRow } from "@/components/admin/AssetSheet";
import type { AssignmentRow } from "@/components/admin/AssetHistorySheet";

const ALLOWED: string[] = ["admin", "hr", "exec", "dept_head"];

export default async function AdminAssetsPage() {
  const employee = await getCurrentEmployee();
  if (!employee || !ALLOWED.includes(employee.role)) redirect("/");

  const supabase = await createClient();
  const isAdmin = employee.role === "admin";

  const [{ data: assets }, { data: employeeList }, { data: allAssignments }] = await Promise.all([
    supabase
      .from("assets")
      .select("id, asset_tag, category, name, brand, model, serial, price, vendor, purchase_date, license_key, license_seats, license_expires_at, status, note, current_holder_id, created_at, updated_at, holder:employees!current_holder_id(id, full_name)")
      .order("asset_tag"),
    supabase
      .from("employees")
      .select("id, full_name, department_id")
      .eq("status", "active")
      .order("full_name"),
    supabase
      .from("asset_assignments")
      .select("id, asset_id, employee_id, assigned_by, assigned_at, accepted_at, returned_at, return_note, status")
      .order("assigned_at", { ascending: false }),
  ]);

  const today = new Date();
  const warn30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const licenseWarnings = (assets ?? []).filter(
    (a) =>
      a.category === "software" &&
      a.license_expires_at &&
      new Date(a.license_expires_at + "T00:00:00") <= warn30
  );

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        title="คลังทรัพย์สิน"
        description="ครุภัณฑ์ ซอฟต์แวร์ และอุปกรณ์ขององค์กร"
      />

      {licenseWarnings.length > 0 && (
        <div className="mx-4 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning md:mx-6">
          ⚠ มีซอฟต์แวร์ {licenseWarnings.length} รายการที่ใบอนุญาตจะหมดอายุ (หรือหมดอายุแล้ว) ภายใน 30 วัน
        </div>
      )}

      <AssetListClient
        assets={(assets ?? []) as unknown as AssetRow[]}
        employeeList={employeeList ?? []}
        allAssignments={(allAssignments ?? []) as unknown as AssignmentRow[]}
        isAdmin={isAdmin}
      />
    </div>
  );
}
