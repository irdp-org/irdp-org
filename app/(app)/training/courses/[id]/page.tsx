import { notFound } from "next/navigation";
import Link from "next/link";
import { Pencil, MapPin, CalendarDays, Target, Users, FileText, Flag } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { ParticipantsClient } from "@/components/training/ParticipantsClient";

export const dynamic = "force-dynamic";

export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const [{ data: course }, { data: participants }] = await Promise.all([
    admin.from("training_courses").select("*").eq("id", id).single(),
    admin.from("training_participants").select("*").eq("course_id", id).order("created_at"),
  ]);

  if (!course) notFound();

  return (
    <div className="flex flex-col gap-5 mx-auto max-w-2xl">
      {/* Course header */}
      <div className="rounded-xl border border-border bg-surface px-4 py-5 flex gap-4 items-start">
        {course.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.logo_url} alt="" className="w-14 h-14 rounded-lg object-contain border border-border shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
            <FileText className="h-7 w-7 text-blue-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-foreground leading-snug">{course.name_th}</h2>
          {course.name_en && <p className="text-xs text-muted-foreground mt-0.5">{course.name_en}</p>}
          <Link
            href={`/training/courses/${id}/edit`}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3 w-3" /> แก้ไขข้อมูลหลักสูตร
          </Link>
        </div>
      </div>

      {/* Course info */}
      <div className="rounded-xl border border-border bg-surface divide-y divide-border">
        {course.training_dates && (
          <Row icon={<CalendarDays className="h-4 w-4" />} label="วันที่จัดอบรม" value={course.training_dates} />
        )}
        {(course.open_date || course.close_date) && (
          <Row icon={<CalendarDays className="h-4 w-4" />} label="รับสมัคร" value={`${course.open_date ?? "?"} – ${course.close_date ?? "?"}`} />
        )}
        {course.location && (
          <Row icon={<MapPin className="h-4 w-4" />} label="สถานที่" value={course.location} />
        )}
        {course.target_group && (
          <Row icon={<Target className="h-4 w-4" />} label="กลุ่มเป้าหมาย" value={course.target_group} />
        )}
        {course.objectives && (
          <Row icon={<Flag className="h-4 w-4" />} label="วัตถุประสงค์" value={course.objectives} multiline />
        )}
        {course.description && (
          <Row icon={<FileText className="h-4 w-4" />} label="รายละเอียด" value={course.description} multiline />
        )}
      </div>

      {/* Participants */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Users className="h-4 w-4 text-blue-500" />
            ผู้เข้าอบรม ({participants?.length ?? 0} คน)
          </h3>
          <Link
            href={`/training/courses/${id}/export`}
            className="text-xs text-blue-600 hover:underline"
          >
            ดาวน์โหลด CSV
          </Link>
        </div>
        <ParticipantsClient courseId={id} participants={participants ?? []} />
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
  multiline,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className={`flex gap-3 px-4 py-3 ${multiline ? "flex-col" : "items-start"}`}>
      <div className="flex items-center gap-2 text-muted-foreground shrink-0 min-w-[120px]">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
