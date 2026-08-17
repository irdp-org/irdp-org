"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bus, Plus, X, Trash2 } from "lucide-react";
import { format } from "date-fns";
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
import { VanBookingSheet, type EmployeeOption } from "./VanBookingSheet";
import { cancelVanBooking, adminDeleteVanBooking, generateVanDoc } from "@/app/(app)/booking/actions";
import { GenerateDocButton } from "./GenerateDocButton";

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
  has_tollway: boolean;
  has_fuel: boolean;
  other_expense: string | null;
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

  function handleAdminDelete(id: string) {
    startTransition(async () => {
      await adminDeleteVanBooking(id);
      router.refresh();
    });
  }

  const columns: Column<VanBookingRow>[] = [
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
      key: "destination",
      label: "ปลายทาง",
      sortValue: (b) => b.destination ?? "",
      render: (b) => <span className="text-foreground">{b.destination || "-"}</span>,
    },
    {
      key: "passengers",
      label: "ผู้ร่วมเดินทาง",
      sortValue: (b) => b.passengers.length,
      render: (b) => <span className="text-muted-foreground">{b.passengers.map((p) => p.full_name).join(", ") || "-"}</span>,
      className: "max-w-[220px]",
    },
    {
      key: "expenses",
      label: "ค่าใช้จ่ายเพิ่มเติม",
      render: (b) =>
        b.has_tollway || b.has_fuel || b.other_expense ? (
          <div className="flex flex-wrap gap-1">
            {b.has_tollway && <Badge variant="outline" className="text-[10px]">ค่าทางด่วน</Badge>}
            {b.has_fuel && <Badge variant="outline" className="text-[10px]">ค่าน้ำมัน</Badge>}
            {b.other_expense && <Badge variant="outline" className="text-[10px]">{b.other_expense}</Badge>}
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: "actions",
      label: "จัดการ",
      render: (b) => {
        const isMine = b.requester_id === currentEmployeeId;
        const cancellable = isMine || canEdit;
        return (
          <div className="flex shrink-0 items-center gap-1">
            <GenerateDocButton id={b.id} generate={generateVanDoc} label="ออกใบจองรถ" />
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
                      ต้องการยกเลิกการจองรถตู้{b.destination ? ` ไป${b.destination}` : ""} ใช่หรือไม่?
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
                    <AlertDialogTitle>ลบรายการจองรถตู้</AlertDialogTitle>
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
        <EmptyState icon={Bus} title="ยังไม่มีการจองรถตู้ใน 30 วันข้างหน้า" description="กดปุ่ม 'จอง' เพื่อจองรถตู้ส่วนกลาง" />
      ) : (
        <SortableTable columns={columns} rows={bookings} rowKey={(b) => b.id} />
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
