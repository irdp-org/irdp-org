import Link from "next/link";
import { Plus, BookOpen } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { CoursesListClient } from "@/components/training/CoursesListClient";

export const dynamic = "force-dynamic";

/** PostgREST caps a plain select at 1000 rows — with 2000+ participants this
 * silently undercounted (or zeroed) later courses, so page through in
 * batches of 1000 to get every row. */
async function fetchAllParticipantCourseIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
): Promise<string[]> {
  const pageSize = 1000;
  let from = 0;
  const ids: string[] = [];
  while (true) {
    const { data, error } = await admin
      .from("training_participants")
      .select("course_id")
      .range(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    ids.push(...data.map((r: { course_id: string }) => r.course_id));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return ids;
}

export default async function CoursesPage() {
  const admin = createAdminClient();
  const { data: courses } = await admin
    .from("training_courses")
    .select("id, name_th, name_en, open_date, close_date, location, logo_url")
    .order("created_at", { ascending: false });

  const courseIds = await fetchAllParticipantCourseIds(admin);
  const countMap = new Map<string, number>();
  for (const courseId of courseIds) {
    countMap.set(courseId, (countMap.get(courseId) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-700">หลักสูตรทั้งหมด ({courses?.length ?? 0})</h2>
        <Link
          href="/training/courses/new"
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> สร้างหลักสูตร
        </Link>
      </div>

      {(!courses || courses.length === 0) ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">ยังไม่มีหลักสูตร</p>
          <p className="text-xs text-muted-foreground">กด &quot;สร้างหลักสูตร&quot; เพื่อเริ่มต้น</p>
        </div>
      ) : (
        <CoursesListClient
          courses={courses.map((c) => ({ ...c, participantCount: countMap.get(c.id) ?? 0 }))}
        />
      )}
    </div>
  );
}
