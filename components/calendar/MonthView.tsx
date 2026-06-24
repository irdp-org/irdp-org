"use client";

import { useState } from "react";
import Link from "next/link";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  format,
  addMonths,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/database.types";

export type CalendarEventRow = {
  id: string;
  title: string;
  description: string | null;
  type: Database["public"]["Enums"]["cal_type_t"];
  scope: Database["public"]["Enums"]["cal_scope_t"];
  start_at: string;
  end_at: string | null;
  all_day: boolean;
};

const TYPE_DOT: Record<CalendarEventRow["type"], string> = {
  holiday: "bg-danger",
  meeting: "bg-primary",
  merit: "bg-accent",
  activity: "bg-success",
  leave: "bg-warning",
  booking: "bg-accent",
};

const TYPE_LABEL_TH: Record<CalendarEventRow["type"], string> = {
  holiday: "วันหยุด",
  meeting: "ประชุม",
  merit: "ทำบุญ",
  activity: "กิจกรรม",
  leave: "ลา",
  booking: "การจอง",
};

const WEEKDAYS_TH = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

function ymKey(d: Date) {
  return format(d, "yyyy-MM");
}

export function MonthView({ month, events }: { month: Date; events: CalendarEventRow[] }) {
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const eventsByDay = new Map<string, CalendarEventRow[]>();
  for (const ev of events) {
    const start = new Date(ev.start_at);
    const end = ev.end_at ? new Date(ev.end_at) : start;
    for (const d of eachDayOfInterval({ start, end })) {
      const key = format(d, "yyyy-MM-dd");
      const list = eventsByDay.get(key) ?? [];
      list.push(ev);
      eventsByDay.set(key, list);
    }
  }

  const selectedEvents = selectedDay ? (eventsByDay.get(format(selectedDay, "yyyy-MM-dd")) ?? []) : [];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Button asChild variant="ghost" size="icon" aria-label="เดือนก่อนหน้า">
          <Link href={`?month=${ymKey(subMonths(month, 1))}`}>
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <span className="text-base font-medium text-foreground">{format(month, "MMMM yyyy")}</span>
        <Button asChild variant="ghost" size="icon" aria-label="เดือนถัดไป">
          <Link href={`?month=${ymKey(addMonths(month, 1))}`}>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAYS_TH.map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayEvents = eventsByDay.get(key) ?? [];
          const inMonth = isSameMonth(day, month);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={cn(
                "flex min-h-16 flex-col items-center gap-1 rounded-lg border border-border p-1 text-xs",
                inMonth ? "bg-background" : "bg-surface text-muted-foreground",
                isToday(day) && "ring-2 ring-primary"
              )}
            >
              <span className={cn(inMonth ? "text-foreground" : "text-muted-foreground")}>
                {format(day, "d")}
              </span>
              <div className="flex flex-wrap justify-center gap-0.5">
                {dayEvents.slice(0, 4).map((ev) => (
                  <span key={ev.id} className={cn("h-1.5 w-1.5 rounded-full", TYPE_DOT[ev.type])} />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <Sheet open={!!selectedDay} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{selectedDay && format(selectedDay, "d MMMM yyyy")}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-4 pb-4">
            {selectedEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">ไม่มีกิจกรรม</p>
            ) : (
              selectedEvents.map((ev) => (
                <div key={ev.id} className="flex items-start gap-3 rounded-xl border border-border bg-surface px-3 py-3 text-sm">
                  <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", TYPE_DOT[ev.type])} />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <p className="font-semibold text-foreground">{ev.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {TYPE_LABEL_TH[ev.type]}
                      {ev.all_day
                        ? " · ทั้งวัน"
                        : ` · ${format(new Date(ev.start_at), "HH:mm")}${ev.end_at ? `–${format(new Date(ev.end_at), "HH:mm")}` : ""}`}
                    </p>
                    {ev.description && (
                      <p className="text-xs text-foreground/70 mt-0.5">{ev.description}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
