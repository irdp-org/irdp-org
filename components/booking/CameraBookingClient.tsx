"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Plus, X, Trash2, Pencil, MapPin } from "lucide-react";
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
import { SortableTable, type Column } from "@/components/shared/SortableTable";
import { CameraBookingSheet } from "./CameraBookingSheet";
import { cancelCameraBooking, adminDeleteCameraBooking } from "@/app/(app)/booking/actions";

export type CameraBookingRow = {
  id: string;
  requester_id: string;
  requester_name: string;
  location: string | null;
  purpose: string | null;
  start_at: string;
  end_at: string;
  status: "booked" | "cancelled";
};

type Props = {
  bookings: CameraBookingRow[];
  currentEmployeeId: string;
  canEdit: boolean;
};

function formatTimeRange(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const sameDay = format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd");
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok", hour12: false };
  const dateOpts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Bangkok" };
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

export function CameraBookingClient({ bookings, currentEmployeeId, canEdit }: Props) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<CameraBookingRow | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCancel(id: string) {
    startTransition(async () => {
      await cancelCameraBooking(id);
      router.refresh();
    });
  }

  function handleAdminDelete(id: string) {
    startTransition(async () => {
      await adminDeleteCameraBooking(id);
      router.refresh();
    });
  }

  const columns: Column<CameraBookingRow>[] = [
    {
      key: "requester_name",
      label: "ผู้จอง",
      sortValue: (b) => b.requester_name,
      render: (b) => (
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-foreground">{b.requester_name}</span>
          {b.requester_id === currentEmployeeId && <Badge variant="secondary" className="text-xs">ฉัน</Badge>}
        </div>
      ),
    },
    {
      key: "start_at",
      label: "วันที่ / เวลา",
      sortValue: (b) => b.start_at,
      render: (b) => <span className="whitespace-nowrap text-foreground">{formatTimeRange(b.start_at, b.end_at)}</span>,
    },
    {
      key: "location",
      label: "สถานที่ใช้งาน",
      sortValue: (b) => b.location ?? "",
      render: (b) => <span className="text-foreground">{b.location || "-"}</span>,
    },
    {
      key: "purpose",
      label: "งาน / วัตถุประสงค์",
      sortValue: (b) => b.purpose ?? "",
      render: (b) => <span className="text-muted-foreground">{b.purpose || "-"}</span>,
      className: "max-w-[240px]",
    },
    {
      key: "actions",
      label: "จัดการ",
      render: (b) => {
        const isMine = b.requester_id === currentEmployeeId;
        const editable = isMine || canEdit;
        return (
          <div className="flex shrink-0 items-center gap-1">
            {editable && b.status === "booked" && (
              <Button
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-primary"
                disabled={isPending}
                onClick={() => {
                  setEditing(b);
                  setSheetOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {editable && b.status === "booked" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-danger" disabled={isPending}>
                    <X className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>ยืนยันการยกเลิก</AlertDialogTitle>
                    <AlertDialogDescription>ต้องการยกเลิกการจองกล้อง{b.purpose ? ` "${b.purpose}"` : ""} ใช่หรือไม่?</AlertDialogDescription>
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
                    <AlertDialogTitle>ลบรายการจองกล้อง</AlertDialogTitle>
                    <AlertDialogDescription>ลบรายการนี้ออกจากระบบถาวร ไม่สามารถกู้คืนได้</AlertDialogDescription>
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
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Camera info + book button */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Camera className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">กล้องประชาสัมพันธ์</p>
            <p className="text-xs text-muted-foreground">มีเพียง 1 ตัว — ใครก็จองได้</p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setSheetOpen(true);
          }}
          className="shrink-0"
        >
          <Plus className="mr-1 h-4 w-4" /> จอง
        </Button>
      </div>

      {bookings.length === 0 ? (
        <EmptyState icon={Camera} title="ยังไม่มีการจองกล้อง" description="กดปุ่ม 'จอง' เพื่อจองกล้องประชาสัมพันธ์" />
      ) : (
        <SortableTable columns={columns} rows={bookings} rowKey={(b) => b.id} />
      )}

      <CameraBookingSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        existing={
          editing
            ? { id: editing.id, location: editing.location, purpose: editing.purpose, start_at: editing.start_at, end_at: editing.end_at }
            : null
        }
      />
    </div>
  );
}
