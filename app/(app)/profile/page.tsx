import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { getSignedAvatarUrl } from "@/lib/storage";
import { roleLabelTh } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { ProfileForm } from "@/components/profile/ProfileForm";

export default async function ProfilePage() {
  const employee = await getCurrentEmployee();
  if (!employee) return null; // (app)/layout.tsx already redirects to /pending

  const supabase = await createClient();
  const [{ data: department }, avatarUrl] = await Promise.all([
    employee.department_id
      ? supabase.from("departments").select("name").eq("id", employee.department_id).single()
      : Promise.resolve({ data: null }),
    getSignedAvatarUrl(employee.avatar_url),
  ]);

  return (
    <div>
      <PageHeader title="โปรไฟล์ของฉัน" />
      <div className="px-4 md:px-6">
        <ProfileForm
          employee={employee}
          avatarUrl={avatarUrl}
          departmentName={department?.name ?? "—"}
          roleLabel={roleLabelTh[employee.role]}
        />
      </div>
    </div>
  );
}
