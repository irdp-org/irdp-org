import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/shell/PageHeader";
import { getAvatarUrl } from "@/lib/storage";
import { DirectoryClient, type DirectoryEmployee } from "@/components/directory/DirectoryClient";

export const revalidate = 300;

export default async function DirectoryPage() {
  const admin = createAdminClient();

  const [{ data: employees }, { data: depts }] = await Promise.all([
    admin
      .from("employees")
      .select("id, full_name, nickname, department_id, position, avatar_url, role, phone, email, birthdate")
      .eq("status", "active")
      .order("full_name"),
    admin.from("departments").select("id, name").order("name"),
  ]);

  const deptMap = new Map((depts ?? []).map((d) => [d.id, d.name]));

  const rows: DirectoryEmployee[] = (employees ?? []).map((e) => ({
    id: e.id,
    full_name: e.full_name,
    nickname: e.nickname,
    department_id: e.department_id,
    department_name: deptMap.get(e.department_id ?? "") ?? "",
    position: e.position,
    avatar_url: e.avatar_url,
    role: e.role,
    phone: e.phone,
    email: e.email,
    birthdate: e.birthdate,
    avatarSrc: getAvatarUrl(e.avatar_url),
  }));

  return (
    <div>
      <PageHeader title="สมุดรายชื่อ" description={`พนักงาน ${rows.length} คน`} />
      <DirectoryClient employees={rows} />
    </div>
  );
}
