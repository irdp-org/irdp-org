import { redirect } from "next/navigation";
import Link from "next/link";
import { MessageCircle, ChevronRight, Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";

const CATEGORY_LABELS: Record<string, string> = {
  news: "ข่าวสาร",
  event: "กิจกรรม",
  announcement: "ประกาศ",
  activity: "ประชาสัมพันธ์",
};

const CATEGORY_COLORS: Record<string, string> = {
  news: "bg-blue-100 text-blue-700",
  event: "bg-green-100 text-green-700",
  announcement: "bg-orange-100 text-orange-700",
  activity: "bg-purple-100 text-purple-700",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export default async function AnnouncementsPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/");

  const supabase = await createClient();
  const { data: announcements } = await supabase
    .from("announcements")
    .select("id, title, body, category, created_at")
    .eq("is_published", true)
    .order("created_at", { ascending: false })
    .limit(50);

  // Get comment counts
  const ids = (announcements ?? []).map((a) => a.id);
  const { data: commentCounts } = ids.length
    ? await supabase
        .from("announcement_comments")
        .select("announcement_id")
        .in("announcement_id", ids)
    : { data: [] };

  const countMap = new Map<string, number>();
  for (const c of commentCounts ?? []) {
    countMap.set(c.announcement_id, (countMap.get(c.announcement_id) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader title="ข่าวสารและประกาศ" description="ข้อมูลจาก HR และผู้ดูแลระบบ" />

      <div className="px-4 md:px-6 flex flex-col gap-3">
        {(!announcements || announcements.length === 0) ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-12 text-center">
            <Megaphone className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">ยังไม่มีประกาศ</p>
          </div>
        ) : (
          announcements.map((ann) => (
            <Link
              key={ann.id}
              href={`/announcements/${ann.id}`}
              className="flex flex-col gap-2 rounded-2xl border border-border bg-white p-4 active:bg-surface"
            >
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEGORY_COLORS[ann.category] ?? "bg-gray-100 text-gray-600"}`}>
                  {CATEGORY_LABELS[ann.category] ?? ann.category}
                </span>
                <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/40 mt-0.5" />
              </div>
              <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{ann.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">{ann.body}</p>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>{timeAgo(ann.created_at)}</span>
                {(countMap.get(ann.id) ?? 0) > 0 && (
                  <span className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3" />
                    {countMap.get(ann.id)} ความคิดเห็น
                  </span>
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
