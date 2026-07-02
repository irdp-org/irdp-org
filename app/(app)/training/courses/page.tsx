import Link from "next/link";
import { Plus, BookOpen, MapPin, CalendarDays, Users } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const admin = createAdminClient();
  const { data: courses } = await admin
    .from("training_courses")
    .select("id, name_th, name_en, open_date, close_date, location, logo_url")
    .order("created_at", { ascending: false });

  // Count participants per course
  const { data: counts } = await admin
    .from("training_participants")
    .select("course_id");

  const countMap = new Map<string, number>();
  for (const row of counts ?? []) {
    countMap.set(row.course_id, (countMap.get(row.course_id) ?? 0) + 1);
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
          <p className="text-xs text-muted-foreground">กด "สร้างหลักสูตร" เพื่อเริ่มต้น</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {courses.map((c) => (
            <Link
              key={c.id}
              href={`/training/courses/${c.id}`}
              className="flex items-start gap-4 rounded-xl border border-border bg-surface px-4 py-4 hover:bg-border/20 transition-colors"
            >
              {/* Logo or placeholder */}
              <div className="shrink-0 w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 overflow-hidden flex items-center justify-center">
                {c.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.logo_url} alt="" className="w-full h-full object-contain" />
                ) : (
                  <BookOpen className="h-6 w-6 text-blue-400" />
                )}
              </div>

              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <p className="font-semibold text-foreground text-sm leading-snug">{c.name_th}</p>
                {c.name_en && (
                  <p className="text-xs text-muted-foreground truncate">{c.name_en}</p>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
                  {c.location && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {c.location}
                    </span>
                  )}
                  {(c.open_date || c.close_date) && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarDays className="h-3 w-3" />
                      {c.open_date ?? "?"} – {c.close_date ?? "?"}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                    <Users className="h-3 w-3" /> {countMap.get(c.id) ?? 0} คน
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
