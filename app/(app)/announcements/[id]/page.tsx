import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { AnnouncementDetailClient } from "@/components/announcements/AnnouncementDetailClient";

const CATEGORY_LABELS: Record<string, string> = {
  news: "ข่าวสาร",
  event: "กิจกรรม",
  announcement: "ประกาศ",
  activity: "ประชาสัมพันธ์",
};

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const supabase = await createClient();
  const [{ data: ann }, { data: comments }] = await Promise.all([
    supabase
      .from("announcements")
      .select("id, title, body, category, created_at, updated_at")
      .eq("id", id)
      .single(),
    supabase
      .from("announcement_comments")
      .select("id, body, created_at, employee_id, employees(full_name, avatar_url)")
      .eq("announcement_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!ann) notFound();

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        title={CATEGORY_LABELS[ann.category] ?? "ประกาศ"}
        description={new Date(ann.created_at).toLocaleDateString("th-TH", {
          day: "numeric", month: "long", year: "numeric",
        })}
      />
      <AnnouncementDetailClient
        announcement={ann}
        comments={(comments ?? []).map((c) => ({
          id: c.id,
          body: c.body,
          created_at: c.created_at,
          employee_id: c.employee_id,
          employee_name: (c.employees as any)?.full_name ?? "ไม่ทราบชื่อ",
        }))}
        currentEmployeeId={employee.id}
        isEditor={employee.role === "admin" || employee.role === "hr"}
      />
    </div>
  );
}
