"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bus, Plus, X, MapPin, Users } from "lucide-react";
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
import { VanBookingSheet, type EmployeeOption } from "./VanBookingSheet";
import { cancelVanBooking } from "@/app/(app)/booking/actions";

export type VanBookingRow = {
  id: string;
  vehicle_id: string;
  requester_id: string;
  requester_name: string;
  destination: string | null;
  purpose: string | null;
  start_at: string;
  end_at: string;
  status: "booked" | "cancelled";
  passengers: { employee_id: string; full_name: string }[];
};

export type VehicleInfo = {
  id: string;
  name: string;
  plate: string | null;
  driver_id: string | null;
  driver_name: string | null;
};

type Props = {
  bookings: VanBookingRow[];
  vehicle: VehicleInfo | null;
  employees: EmployeeOption[];
  currentEmployeeId: string;
  canEdit: boolean;
};

function formatTimeRange(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const sameDay = format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd");
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
    hour12: false,
  };
  const dateOpts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Bangkok",
  };
  if (sameDay) {
    return `${start.toLocaleDateString("th-TH", dateOpts)} · ${start.toLocaleTimeString("th-TH", timeOpts)} – ${end.toLocaleTimeString("th-TH", timeOpts)}`;
  }
  return `${start.toLocaleDateString("th-TH", dateOpts)} ${start.toLocaleTimeString("th-TH", timeOpts)} – ${end.toLocaleDateString("th-TH", dateOpts)} ${end.toLocaleTimeString("th-TH", timeOpts)}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return "วันนี้";
  if (isTomorrow(d)) return "พรุ่งนี้";
  return format(d, "d MMMM yyyy", { locale: th });
}

export function VanBookingClient({
  bookings,
  vehicle,
  employees,
  currentEmployeeId,
  canEdit,
}: Props) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleCancel(id: string) {
    startTransition(async () => {
      await cancelVanBooking(id);
      router.refresh();
    });
  }

  // Group bookings by date (Bangkok local date)
  const grouped = new Map<string, VanBookingRow[]>();
  for (const b of bookings) {
    const key = new Date(b.start_at).toLocaleDateString("th-TH", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Bangkok",
    });
    const list = grouped.get(key) ?? [];
    list.push(b);
    grouped.set(key, list);
  }

  // Sort entries by the first booking's start_at
  const sortedGroups = [...grouped.entries()].sort(([, a], [, b]) =>
    a[0].start_at.localeCompare(b[0].start_at)
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Vehicle info + book button */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Bus className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">
              {vehicle?.name ?? "รถตู้ส่วนกลาง"}
            </p>
            {vehicle?.plate && (
              <p className="text-xs text-muted-foreground">ทะเบียน {vehicle.plate}</p>
            )}
            {vehicle?.driver_name && (
              <p className="text-xs text-muted-foreground">คนขับ: {vehicle.driver_name}</p>
            )}
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setSheetOpen(true)}
          className="shrink-0"
        >
          <Plus className="mr-1 h-4 w-4" /> จอง
        </Button>
      </div>

      {/* Booking list */}
      {bookings.length === 0 ? (
        <EmptyState icon={Bus} title="ยังไม่มีการจองรถตู้" description="กดปุ่ม 'จอง' เพื่อจองรถตู้ส่วนกลาง" />
      ) : (
        <div className="flex flex-col gap-5">
          {sortedGroups.map(([dateKey, rows]) => (
            <div key={dateKey}>
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {dayLabel(rows[0].start_at)}
              </p>
              <ul className="flex flex-col gap-2">
                {rows.map((b) => {
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
                            {b.requester_name}
                          </span>
                          {isMine && (
                            <Badge variant="secondary" className="text-xs">ฉัน</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatTimeRange(b.start_at, b.end_at)}
                        </p>
                        {b.destination && (
                          <p className="flex items-center gap-1 text-xs text-foreground">
                            <MapPin className="h-3 w-3 shrink-0 text-accent" />
                            {b.destination}
                          </p>
                        )}
                        {b.passengers.length > 0 && (
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="h-3 w-3 shrink-0" />
                            {b.passengers.map((p) => p.full_name).join(", ")}
                          </p>
                        )}
                      </div>

                      {cancellable && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="ml-2 shrink-0 text-muted-foreground hover:text-danger"
                              disabled={isPending}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>ยืนยันการยกเลิก</AlertDialogTitle>
                              <AlertDialogDescription>
                                ต้องการยกเลิกการจองรถตู้{b.destination ? ` ไป${b.destination}` : ""} ใช่หรือไม่?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>ไม่</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-danger hover:bg-danger/90"
                                onClick={() => handleCancel(b.id)}
                              >
                                ยกเลิกการจอง
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {vehicle && (
        <VanBookingSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          vehicleId={vehicle.id}
          employees={employees}
          currentEmployeeId={currentEmployeeId}
        />
      )}
    </div>
  );
}
