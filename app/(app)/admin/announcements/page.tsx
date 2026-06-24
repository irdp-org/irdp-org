import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { canEdit } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { AnnouncementsAdminClient } from "@/components/admin/AnnouncementsAdminClient";

export const revalidate = 0;

export type AdminAnnouncement = {
  id: string;
  title: string;
  body: string;
  category: string;
  is_published: boolean;
  notify_push: boolean;
  created_at: string;
};

export default async function AdminAnnouncementsPage() {
  const employee = await getCurrentEmployee();
  if (!employee || !canEdit(employee.role)) redirect("/");

  const supabase = await createClient();
  const { data: announcements } = await supabase
    .from("announcements")
    .select("id, title, body, category, is_published, notify_push, created_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader title="จัดการประกาศ" description="สร้างและเผยแพร่ข่าวสาร ประกาศ กิจกรรม" />
      <div className="px-4 md:px-6">
        <AnnouncementsAdminClient announcements={(announcements ?? []) as AdminAnnouncement[]} />
      </div>
    </div>
  );
}
