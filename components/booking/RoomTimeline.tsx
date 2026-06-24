"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export type TimelineBooking = {
  id: string;
  room_id: string;
  title: string | null;
  start_at: string;
  end_at: string;
  requester_name: string;
};

type Room = { id: string; name: string };

type Props = {
  rooms: Room[];
  bookings: TimelineBooking[];
  selectedDate: string; // YYYY-MM-DD
  onDateChange: (d: string) => void;
};

const TZ = "Asia/Bangkok";
const HOUR_START = 7;  // 07:00
const HOUR_END = 20;   // 20:00
const TOTAL_MINUTES = (HOUR_END - HOUR_START) * 60;

/** Convert UTC ISO → minutes-since-07:00 Bangkok time, clamped to [0, TOTAL_MINUTES]. */
function toMinutes(iso: string): number {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).formatToParts(d);
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return Math.max(0, Math.min(TOTAL_MINUTES, (h - HOUR_START) * 60 + m));
}

function toLocalDateStr(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  });
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00+07:00");
  d.setDate(d.getDate() + delta);
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

function formatDisplayDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00+07:00").toLocaleDateString("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  });
}

const HOUR_LABELS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

const BLOCK_COLORS = [
  "bg-primary/20 border-primary/40 text-primary",
  "bg-accent/20 border-accent/40 text-accent-dark",
];

export function RoomTimeline({ rooms, bookings, selectedDate, onDateChange }: Props) {
  const dayBookings = bookings.filter((b) => toLocalDateStr(b.start_at) === selectedDate);

  return (
    <div className="flex flex-col gap-3">
      {/* Date navigator */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-3 py-2">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => onDateChange(addDays(selectedDate, -1))}
          aria-label="วันก่อนหน้า"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium text-foreground">{formatDisplayDate(selectedDate)}</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => onDateChange(addDays(selectedDate, 1))}
          aria-label="วันถัดไป"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Timeline grid — overflow-x-auto must be on a block with explicit width
          so the scroll is contained to this element and not the page body. */}
      <div className="w-full overflow-x-auto rounded-2xl border border-border bg-white">
        <div className="min-w-[480px]">
          {/* Hour ruler */}
          <div className="flex border-b border-border">
            {/* Room label column */}
            <div className="w-28 shrink-0 border-r border-border" />
            <div className="relative flex-1">
              <div className="flex">
                {HOUR_LABELS.map((h) => (
                  <div
                    key={h}
                    className="flex-1 border-r border-border/40 px-0.5 py-1 text-center text-[10px] text-muted-foreground last:border-r-0"
                    style={{ minWidth: 0 }}
                  >
                    {String(h).padStart(2, "0")}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* One row per room */}
          {rooms.map((room, roomIdx) => {
            const roomBookings = dayBookings.filter((b) => b.room_id === room.id);
            return (
              <div key={room.id} className="flex border-b border-border last:border-b-0">
                {/* Room name */}
                <div className="flex w-28 shrink-0 items-center border-r border-border px-2 py-3">
                  <span className="line-clamp-2 text-xs font-medium text-foreground">{room.name}</span>
                </div>

                {/* Timeline track */}
                <div className="relative flex-1 py-2" style={{ minHeight: "52px" }}>
                  {/* Hour grid lines */}
                  <div className="pointer-events-none absolute inset-0 flex">
                    {HOUR_LABELS.map((h) => (
                      <div key={h} className="flex-1 border-r border-border/20 last:border-r-0" />
                    ))}
                  </div>

                  {/* Booking blocks */}
                  {roomBookings.map((b) => {
                    const startMin = toMinutes(b.start_at);
                    const endMin = toMinutes(b.end_at);
                    const widthPct = Math.max(1, ((endMin - startMin) / TOTAL_MINUTES) * 100);
                    const leftPct = (startMin / TOTAL_MINUTES) * 100;
                    const colorClass = BLOCK_COLORS[roomIdx % BLOCK_COLORS.length];
                    return (
                      <div
                        key={b.id}
                        className={`absolute inset-y-1 flex flex-col justify-center overflow-hidden rounded border px-1.5 text-[10px] leading-tight ${colorClass}`}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%`, minWidth: "2px" }}
                        title={`${b.title ?? "(ไม่ระบุ)"} — ${b.requester_name}\n${formatTime(b.start_at)}–${formatTime(b.end_at)}`}
                      >
                        <span className="truncate font-medium">{b.title ?? "(ไม่ระบุ)"}</span>
                        <span className="truncate opacity-75">
                          {formatTime(b.start_at)}–{formatTime(b.end_at)}
                        </span>
                      </div>
                    );
                  })}

                  {roomBookings.length === 0 && (
                    <span className="absolute inset-0 flex items-center px-2 text-[10px] text-muted-foreground/60">
                      ว่าง
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      {dayBookings.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {dayBookings.map((b) => {
            const room = rooms.find((r) => r.id === b.room_id);
            return (
              <li key={b.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-primary/60" />
                <span>
                  <span className="font-medium text-foreground">{room?.name}</span>
                  {" · "}
                  {b.title ?? "(ไม่ระบุหัวข้อ)"}
                  {" · "}
                  {formatTime(b.start_at)}–{formatTime(b.end_at)}
                  {" · "}
                  {b.requester_name}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
