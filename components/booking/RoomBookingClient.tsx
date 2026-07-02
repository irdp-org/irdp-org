"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, Plus, X, Trash2, LayoutList, CalendarRange } from "lucide-react";
import { format, isToday, isTomorrow } from "date-fns";
import { th } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/shell/EmptyState";
import { RoomBookingSheet, type RoomOption } from "./RoomBookingSheet";
import { RoomTimeline, type TimelineBooking } from "./RoomTimeline";
import { cancelRoomBooking, adminDeleteRoomBooking, generateRoomDoc } from "@/app/(app)/booking/actions";
import { GenerateDocButton } from "./GenerateDocButton";

export type RoomBookingRow = {
  id: string;
  room_id: string;
  requester_id: string;
  requester_name: string;
  title: string | null;
  start_at: string;
  end_at: string;
  status: "booked" | "cancelled";
  equipment: string[];
};

type Props = {
  bookings: RoomBookingRow[];
  rooms: RoomOption[];
  currentEmployeeId: string;
  canEdit: boolean;
};

function timeRange(startAt: string, endAt: string) {
  const opts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
    hour12: false,
  };
  const s = new Date(startAt).toLocaleTimeString("th-TH", opts);
  const e = new Date(endAt).toLocaleTimeString("th-TH", opts);
  return `${s} – ${e}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return "วันนี้";
  if (isTomorrow(d)) return "พรุ่งนี้";
  return format(d, "d MMMM yyyy", { locale: th });
}

function groupByDate(rows: RoomBookingRow[]) {
  const map = new Map<string, RoomBookingRow[]>();
  for (const b of rows) {
    const key = new Date(b.start_at).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
    const list = map.get(key) ?? [];
    list.push(b);
    map.set(key, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

export function RoomBookingClient({ bookings, rooms, currentEmployeeId, canEdit }: Props) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [defaultRoomId, setDefaultRoomId] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const [view, setView] = useState<"list" | "timeline">("list");
  const [timelineDate, setTimelineDate] = useState(todayStr());

  function openSheet(roomId?: string) {
    setDefaultRoomId(roomId);
    setSheetOpen(true);
  }

  function handleCancel(id: string) {
    startTransition(async () => {
      await cancelRoomBooking(id);
      router.refresh();
    });
  }

  function handleAdminDelete(id: string) {
    startTransition(async () => {
      await adminDeleteRoomBooking(id);
      router.refresh();
    });
  }

  const roomById = new Map(rooms.map((r) => [r.id, r]));

  const todayKey = todayStr();
  const todayByRoom = new Map<string, number>();
  for (const b of bookings) {
    const bDate = new Date(b.start_at).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
    if (bDate === todayKey) {
      todayByRoom.set(b.room_id, (todayByRoom.get(b.room_id) ?? 0) + 1);
    }
  }

  const grouped = groupByDate(bookings);

  const timelineBookings: TimelineBooking[] = bookings.map((b) => ({
    id: b.id,
    room_id: b.room_id,
    title: b.title,
    start_at: b.start_at,
    end_at: b.end_at,
    requester_name: b.requester_name,
  }));

  return (
    <div className="flex flex-col gap-4">
      {/* Room cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rooms.map((room) => {
          const todayCount = todayByRoom.get(room.id) ?? 0;
          return (
            <div
              key={room.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <DoorOpen className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{room.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {room.size === "small" ? "ห้องเล็ก" : room.size === "large" ? "ห้องใหญ่" : ""}
                    {todayCount > 0 ? ` · วันนี้ ${todayCount} รายการ` : " · ว่างวันนี้"}
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={() => openSheet(room.id)} className="shrink-0">
                <Plus className="mr-1 h-4 w-4" /> จอง
              </Button>
            </div>
          );
        })}
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={view === "list" ? "default" : "outline"}
          onClick={() => setView("list")}
          className="gap-1.5"
        >
          <LayoutList className="h-3.5 w-3.5" /> รายการ
        </Button>
        <Button
          size="sm"
          variant={view === "timeline" ? "default" : "outline"}
          onClick={() => setView("timeline")}
          className="gap-1.5"
        >
          <CalendarRange className="h-3.5 w-3.5" /> ตารางเวลา
        </Button>
      </div>

      {/* Timeline view */}
      {view === "timeline" && (
        <RoomTimeline
          rooms={rooms}
          bookings={timelineBookings}
          selectedDate={timelineDate}
          onDateChange={setTimelineDate}
        />
      )}

      {/* List view */}
      {view === "list" && (
        bookings.length === 0 ? (
          <EmptyState
            icon={DoorOpen}
            title="ยังไม่มีการจองห้องประชุม"
            description="กดปุ่ม 'จอง' ที่ห้องที่ต้องการ"
          />
        ) : (
          <div className="flex flex-col gap-5">
            {grouped.map(([, rows]) => (
              <div key={rows[0].start_at}>
                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {dayLabel(rows[0].start_at)}
                </p>
                <ul className="flex flex-col gap-2">
                  {rows.map((b) => {
                    const room = roomById.get(b.room_id);
                    const isMine = b.requester_id === currentEmployeeId;
                    const cancellable = isMine || canEdit;
                    return (
                      <li
                        key={b.id}
                        className="flex items-start justify-between rounded-2xl border border-border bg-white px-4 py-3"
                      >
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {b.title ?? "(ไม่ระบุหัวข้อ)"}
                            </span>
                            {isMine && (
                              <Badge variant="secondary" className="text-xs">ฉัน</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {timeRange(b.start_at, b.end_at)} · {room?.name ?? "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">จองโดย {b.requester_name}</p>
                          {b.equipment.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {b.equipment.map((eq) => (
                                <Badge key={eq} variant="outline" className="text-[10px]">{eq}</Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="ml-2 flex shrink-0 items-center gap-1">
                          <GenerateDocButton id={b.id} generate={generateRoomDoc} label="ออกใบจองห้อง" />
                          {cancellable && b.status === "booked" && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-danger" disabled={isPending}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>ยืนยันการยกเลิก</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    ต้องการยกเลิกการจอง{room?.name ? `ห้อง${room.name}` : "ห้องประชุม"}{b.title ? ` "${b.title}"` : ""} ใช่หรือไม่?
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>ไม่</AlertDialogCancel>
                                  <AlertDialogAction className="bg-danger hover:bg-danger/90" onClick={() => handleCancel(b.id)}>
                                    ยกเลิกการจอง
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                          {canEdit && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-danger" disabled={isPending}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>ลบรายการจองห้องประชุม</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    ลบรายการนี้ออกจากระบบถาวร ไม่สามารถกู้คืนได้
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                                  <AlertDialogAction className="bg-danger hover:bg-danger/90" onClick={() => handleAdminDelete(b.id)}>
                                    ลบถาวร
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )
      )}

      <RoomBookingSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        rooms={rooms}
        defaultRoomId={defaultRoomId}
      />
    </div>
  );
}
