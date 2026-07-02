"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Users, MapPin, CalendarDays, ChevronRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addBatch, deleteBatch } from "@/app/(app)/training/courses/actions";

type Batch = {
  id: string;
  course_id: string;
  batch_no: number | null;
  training_dates: string | null;
  location: string | null;
  note: string | null;
  participant_count: number;
};

export function BatchesClient({ courseId, batches }: { courseId: string; batches: Batch[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await addBatch(courseId, fd);
      if ("error" in res && res.error) { setError(res.error); return; }
      (e.target as HTMLFormElement).reset();
      setShowForm(false);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteBatch(id, courseId);
      setConfirmId(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {!showForm && (
        <Button
          type="button"
          variant="outline"
          className="gap-2 self-start border-blue-200 text-blue-600 hover:bg-blue-50"
          onClick={() => setShowForm(true)}
        >
          <Plus className="h-4 w-4" /> เพิ่มรุ่น
        </Button>
      )}

      {showForm && (
        <form
          onSubmit={handleAdd}
          className="rounded-xl border border-blue-200 bg-blue-50/50 px-4 py-4 flex flex-col gap-3"
        >
          <p className="text-sm font-medium text-blue-700">เพิ่มรุ่นใหม่</p>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-foreground">เลขรุ่น</label>
            <input
              name="batch_no"
              type="number"
              min={1}
              placeholder="เช่น 1"
              className="w-32 rounded-md border border-input bg-background px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-foreground">วันที่จัดอบรม</label>
            <input
              name="training_dates"
              placeholder="เช่น 10–12 สิงหาคม 2568"
              className="rounded-md border border-input bg-background px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-foreground">สถานที่</label>
            <input
              name="location"
              placeholder="สถานที่จัดอบรมรุ่นนี้"
              className="rounded-md border border-input bg-background px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending} className="bg-blue-600 hover:bg-blue-700">
              {isPending ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setShowForm(false); setError(null); }}>
              ยกเลิก
            </Button>
          </div>
        </form>
      )}

      {batches.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">ยังไม่มีรุ่น กด "เพิ่มรุ่น" เพื่อเริ่มต้น</p>
      ) : (
        <div className="flex flex-col gap-2">
          {batches.map((b) => (
            <div key={b.id} className="flex items-center gap-2 rounded-xl border border-border bg-surface">
              <Link
                href={`/training/courses/${courseId}/batches/${b.id}`}
                className="flex flex-1 items-center justify-between gap-3 px-4 py-3 min-w-0"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    รุ่นที่ {b.batch_no ?? "-"}
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {b.training_dates && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays className="h-3 w-3" /> {b.training_dates}
                      </span>
                    )}
                    {b.location && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {b.location}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                      <Users className="h-3 w-3" /> {b.participant_count} คน
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
              <div className="shrink-0 pr-3 flex gap-1">
                {confirmId === b.id ? (
                  <>
                    <button type="button" onClick={() => handleDelete(b.id)} disabled={isPending}
                      className="rounded p-1 text-danger hover:bg-danger/10">
                      <Check className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setConfirmId(null)}
                      className="rounded p-1 text-muted-foreground hover:bg-border">
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmId(b.id)}
                    className="rounded p-1 text-muted-foreground hover:text-danger hover:bg-danger/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
