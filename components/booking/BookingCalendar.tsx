"use client";

import { useState } from "react";
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
import { ChevronLeft, ChevronRight, Bus, DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type BookingEvent = {
  id: string;
  type: "van" | "room";
  title: string;
  sub: string;
  start_at: string;
  end_at: string;
  requester: string;
  status: string;
};

const WEEKDAYS_TH = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const TZ = "Asia/Bangkok";

function ymKey(d: Date) {
  return format(d, "yyyy-MM");
}
function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
}
function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
}

export function BookingCalendar({ events }: { events: BookingEvent[] }) {
  const [month, setMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  // Bucket events by Bangkok day
  const byDay = new Map<string, BookingEvent[]>();
  for (const ev of events) {
    const k = dayKey(ev.start_at);
    const list = byDay.get(k) ?? [];
    list.push(ev);
    byDay.set(k, list);
  }

  const selectedEvents = selectedDay
    ? (byDay.get(selectedDay) ?? []).sort((a, b) => a.start_at.localeCompare(b.start_at))
    : [];

  return (
    <div>
      {/* Month nav */}
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setMonth(subMonths(month, 1))} aria-label="เดือนก่อนหน้า">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-base font-medium text-foreground">{format(month, "MMMM yyyy")}</span>
        <Button variant="ghost" size="icon" onClick={() => setMonth(addMonths(month, 1))} aria-label="เดือนถัดไป">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Legend */}
      <div className="mb-2 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-primary" /> รถตู้</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-success" /> ห้องประชุม</span>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAYS_TH.map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayEvents = byDay.get(key) ?? [];
          const inMonth = isSameMonth(day, month);
          const vanCount = dayEvents.filter((e) => e.type === "van").length;
          const roomCount = dayEvents.filter((e) => e.type === "room").length;
          return (
            <button
              key={key}
              type="button"
              onClick={() => dayEvents.length && setSelectedDay(key)}
              className={cn(
                "flex min-h-16 flex-col items-center gap-1 rounded-lg border border-border p-1 text-xs",
                inMonth ? "bg-background" : "bg-surface text-muted-foreground",
                isToday(day) && "ring-2 ring-primary",
                !dayEvents.length && "cursor-default"
              )}
            >
              <span className={cn(inMonth ? "text-foreground" : "text-muted-foreground")}>{format(day, "d")}</span>
              <div className="flex flex-wrap justify-center gap-0.5">
                {vanCount > 0 && (
                  <span className="rounded bg-primary/15 px-1 text-[10px] font-medium text-primary">🚐{vanCount}</span>
                )}
                {roomCount > 0 && (
                  <span className="rounded bg-success/15 px-1 text-[10px] font-medium text-success">🚪{roomCount}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Day detail */}
      <Dialog open={!!selectedDay} onOpenChange={(o) => !o && setSelectedDay(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedDay && new Date(selectedDay + "T00:00:00+07:00").toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ })}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-1">
            {selectedEvents.map((ev) => (
              <div key={ev.id} className="flex items-start gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm">
                <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", ev.type === "van" ? "bg-primary/10" : "bg-success/10")}>
                  {ev.type === "van" ? <Bus className="h-4 w-4 text-primary" /> : <DoorOpen className="h-4 w-4 text-success" />}
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="font-medium text-foreground">{ev.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {ev.sub} · {timeLabel(ev.start_at)}–{timeLabel(ev.end_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">โดย {ev.requester}{ev.status === "cancelled" ? " · (ประวัติ/ยกเลิก)" : ""}</p>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
