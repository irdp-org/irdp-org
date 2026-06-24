import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shell/PageHeader";
import { MyAssetsClient, type MyAssignment } from "@/components/assets/MyAssetsClient";

export default async function AssetsPage() {
  const employee = await getCurrentEmployee();
  if (!employee) return null;

  const supabase = await createClient();

  const { data: assignments } = await supabase
    .from("asset_assignments")
    .select(
      "id, asset_id, assigned_at, accepted_at, status, asset:assets(id, asset_tag, category, name, brand, model, serial)"
    )
    .eq("employee_id", employee.id)
    .in("status", ["pending_accept", "accepted"])
    .order("assigned_at", { ascending: false });

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        title="ทรัพย์สินของฉัน"
        description="ทรัพย์สินที่ได้รับมอบหมายจากองค์กร"
      />
      <div className="px-4 md:px-6">
        <MyAssetsClient assignments={(assignments ?? []) as unknown as MyAssignment[]} />
      </div>
    </div>
  );
}
