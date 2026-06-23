import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { canEdit } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { WorkLocationListClient } from "@/components/admin/WorkLocationListClient";

export default async function WorkLocationsAdminPage() {
  const employee = await getCurrentEmployee();
  if (!employee || !canEdit(employee.role)) redirect("/");

  const supabase = await createClient();
  const { data: locations } = await supabase
    .from("work_locations")
    .select("id, name, lat, lng, radius_m, required_photos, active")
    .order("name");

  return (
    <div>
      <PageHeader title="สถานที่ทำงาน" description="เพิ่ม/แก้ไขสถานที่สำหรับเช็คอินนอกสถานที่" />
      <div className="px-4 md:px-6">
        <WorkLocationListClient locations={locations ?? []} />
      </div>
    </div>
  );
}
