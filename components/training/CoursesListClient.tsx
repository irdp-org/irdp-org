"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BookOpen, MapPin, CalendarDays, Users, Trash2 } from "lucide-react";
import { deleteCourse } from "@/app/(app)/training/courses/actions";

export type CourseRow = {
  id: string;
  name_th: string;
  name_en: string | null;
  open_date: string | null;
  close_date: string | null;
  location: string | null;
  logo_url: string | null;
  participantCount: number;
};

export function CoursesListClient({ courses }: { courses: CourseRow[] }) {
  const router = useRouter();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteCourse(id);
      setConfirmId(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {courses.map((c) => (
        <div
          key={c.id}
          className="flex items-start gap-4 rounded-xl border border-border bg-surface px-4 py-4 hover:bg-border/20 transition-colors"
        >
          <Link href={`/training/courses/${c.id}`} className="shrink-0 w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 overflow-hidden flex items-center justify-center">
            {c.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.logo_url} alt="" className="w-full h-full object-contain" />
            ) : (
              <BookOpen className="h-6 w-6 text-blue-400" />
            )}
          </Link>

          <Link href={`/training/courses/${c.id}`} className="flex flex-col gap-1 min-w-0 flex-1">
            <p className="font-semibold text-foreground text-sm leading-snug">{c.name_th}</p>
            {c.name_en && <p className="text-xs text-muted-foreground truncate">{c.name_en}</p>}
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
                <Users className="h-3 w-3" /> {c.participantCount} คน
              </span>
            </div>
          </Link>

          <div className="shrink-0 flex items-center gap-2 pt-1">
            {confirmId === c.id ? (
              <>
                <button
                  type="button"
                  onClick={() => handleDelete(c.id)}
                  disabled={isPending}
                  className="text-xs font-medium text-danger"
                >
                  ยืนยันลบ
                </button>
                <button type="button" onClick={() => setConfirmId(null)} className="text-xs text-muted-foreground">
                  ยกเลิก
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmId(c.id)}
                className="flex items-center gap-1 text-xs text-danger hover:underline"
              >
                <Trash2 className="h-3.5 w-3.5" /> ลบ
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
