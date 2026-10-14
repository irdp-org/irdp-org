"use client";

import { useState } from "react";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { History, GraduationCap, User, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ActivityHistoryRow = {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  location: string | null;
  is_training: boolean;
  organizer: string | null;
  instructor: string | null;
};

export function ActivityHistoryList({ activities }: { activities: ActivityHistoryRow[] }) {
  const [open, setOpen] = useState(false);
  const now = new Date();

  const upcoming = activities.filter((a) => new Date(a.end_at ?? a.start_at) >= now);
  const past = activities
    .filter((a) => new Date(a.end_at ?? a.start_at) < now)
    .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime());

  function renderRow(a: ActivityHistoryRow) {
    const start = new Date(a.start_at);
    const end = a.end_at ? new Date(a.end_at) : null;
    return (
      <div key={a.id} className="flex flex-col gap-0.5 rounded-lg bg-surface px-3 py-2 text-sm">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          {a.is_training && <GraduationCap className="h-3.5 w-3.5 shrink-0 text-primary" />}
          {a.title}
        </span>
        <span className="text-xs text-muted-foreground">
          {format(start, "d MMMM yyyy", { locale: th })}
          {!a.all_day && ` · ${format(start, "HH:mm")}${end ? `–${format(end, "HH:mm")}` : ""} น.`}
          {a.location && (
            <span className="inline-flex items-center gap-0.5">
              {" · "}
              <MapPin className="h-3 w-3" /> {a.location}
            </span>
          )}
        </span>
        {(a.organizer || a.instructor) && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            {[a.organizer ? `จัดโดย ${a.organizer}` : null, a.instructor ? `วิทยากร ${a.instructor}` : null].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-1.5 self-start" onClick={() => setOpen(true)}>
        <History className="h-4 w-4" /> ประวัติกิจกรรม
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ประวัติกิจกรรม</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">กำลังจะถึง</p>
              {upcoming.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">ไม่มีกิจกรรมที่กำลังจะถึง</p>
              ) : (
                <div className="flex flex-col gap-2">{upcoming.map(renderRow)}</div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">ผ่านมาแล้ว</p>
              {past.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">ยังไม่มีประวัติ</p>
              ) : (
                <div className={cn("flex flex-col gap-2")}>{past.map(renderRow)}</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
