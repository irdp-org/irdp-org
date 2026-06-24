"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, X, MapPin, Sunrise, Sunset, Check, Info, Calendar } from "lucide-react";
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
import { FieldRequestSheet } from "./FieldRequestSheet";
import { CheckinDialog } from "./CheckinDialog";
import { FIELD_TYPE_LABELS_TH, FIELD_STATUS_LABELS_TH } from "@/lib/ot";
import { cancelFieldRequest } from "@/app/(app)/field/actions";
import { checkInWfh } from "@/app/(app)/field/checkin-actions";
import type { RequestStatusT, AttendanceTypeT, CheckinKindT } from "@/lib/database.types";

export type OwnFieldRequest = {
  id: string;
  type: AttendanceTypeT;
  location_id: string | null;
  location_name?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_radius_m?: number | null;
  location_required_photos?: number | null;
  work_date: string;
  planned_start: string | null;
  planned_end: string | null;
  ot_hours: number | null;
  status: RequestStatusT;
  reason: string | null;
  is_today?: boolean;
  checkins?: { kind: CheckinKindT; happened_at: string }[];
};

const STATUS_VARIANT: Record<RequestStatusT, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  submitted: "secondary",
  approved: "default",
  rejected: "destructive",
  returned: "destructive",
  cancelled: "outline",
};

function WfhCheckinButton({
  fieldRequestId,
  kind,
  label,
  icon: Icon,
}: {
  fieldRequestId: string;
  kind: "wfh_morning" | "wfh_evening";
  label: string;
  icon: typeof Sunrise;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const res = await checkInWfh(fieldRequestId, kind);
            if ("error" in res && res.error) {
              setError(res.error);
              return;
            }
            router.refresh();
          })
        }
      >
        <Icon className="h-4 w-4" /> {label}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function FieldRequestsClient({
  requests,
  locations,
}: {
  requests: OwnFieldRequest[];
  locations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<OwnFieldRequest | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCancel(id: string) {
    startTransition(async () => {
      await cancelFieldRequest(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        className="self-start"
        onClick={() => {
          setEditing(null);
          setSheetOpen(true);
        }}
      >
        <Plus className="h-4 w-4" /> ยื่นคำขอ
      </Button>

      {requests.length === 0 ? (
        <EmptyState icon={MapPin} title="ยังไม่มีคำขอนอกสถานที่/WFH" />
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.map((r) => {
            const editable = r.status === "draft" || r.status === "returned";
            const cancellable = r.status !== "approved" && r.status !== "cancelled" && r.status !== "rejected";
            const checkins = r.checkins ?? [];
            const canCheckin = r.status === "approved" && r.is_today;

            const hasIn = checkins.some((c) => c.kind === "in");
            const hasOut = checkins.some((c) => c.kind === "out");
            const hasMorning = checkins.some((c) => c.kind === "wfh_morning");
            const hasEvening = checkins.some((c) => c.kind === "wfh_evening");

            return (
              <li
                key={r.id}
                className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5 text-sm">
                    <span className="font-medium text-foreground">
                      {FIELD_TYPE_LABELS_TH[r.type as "offsite" | "wfh"] ?? r.type}
                      {r.location_name ? ` · ${r.location_name}` : ""}
                    </span>
                    <span className="text-muted-foreground">
                      {format(new Date(r.work_date), "d MMM yyyy")}
                      {r.planned_start && r.planned_end && (
                        <>
                          {" "}
                          · {format(new Date(r.planned_start), "HH:mm")}–
                          {format(new Date(r.planned_end), "HH:mm")}
                        </>
                      )}
                      {r.ot_hours ? ` · OT ${r.ot_hours} ชม.` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[r.status]}>{FIELD_STATUS_LABELS_TH[r.status]}</Badge>
                    {editable && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="แก้ไข"
                        onClick={() => {
                          setEditing(r);
                          setSheetOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {cancellable && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" variant="ghost" size="icon" aria-label="ยกเลิก" disabled={isPending}>
                            <X className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>ยกเลิกคำขอนี้?</AlertDialogTitle>
                            <AlertDialogDescription>
                              ยกเลิกแล้วต้องยื่นคำขอใหม่หากต้องการช่วงนี้
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>ปิด</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleCancel(r.id)}>ยกเลิกคำขอ</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>

                {/* Hint: waiting for approval */}
                {(r.status === "submitted" || r.status === "draft") && r.type !== "ot" && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    รอการอนุมัติ — ปุ่มเช็คอินจะปรากฏหลังอนุมัติในวันปฏิบัติงาน
                  </p>
                )}

                {/* Hint: approved but not today */}
                {r.status === "approved" && !r.is_today && r.type !== "ot" && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    อนุมัติแล้ว — เช็คอินได้ในวันที่ {format(new Date(r.work_date), "d MMM yyyy")}
                  </p>
                )}

                {/* Hint: approved + today but location has no GPS coords */}
                {canCheckin && r.type === "offsite" && (r.location_lat == null || r.location_lng == null) && (
                  <p className="flex items-center gap-1.5 text-xs text-warning">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    สถานที่ยังไม่มีพิกัด GPS กรุณาแจ้ง admin ตั้งค่าพิกัดให้สถานที่นี้ก่อน
                  </p>
                )}

                {canCheckin && r.type === "offsite" && r.location_lat != null && r.location_lng != null && (
                  <div className="flex flex-wrap items-center gap-2">
                    {!hasIn && (
                      <CheckinDialog
                        fieldRequestId={r.id}
                        kind="in"
                        label="เช็คอิน"
                        locationLat={r.location_lat}
                        locationLng={r.location_lng}
                        radiusM={r.location_radius_m ?? 200}
                        requiredPhotos={r.location_required_photos ?? 1}
                      />
                    )}
                    {hasIn && !hasOut && (
                      <CheckinDialog
                        fieldRequestId={r.id}
                        kind="out"
                        label="เช็คเอาท์"
                        locationLat={r.location_lat}
                        locationLng={r.location_lng}
                        radiusM={r.location_radius_m ?? 200}
                        requiredPhotos={r.location_required_photos ?? 1}
                      />
                    )}
                    {hasIn && hasOut && (
                      <span className="flex items-center gap-1 text-xs text-success">
                        <Check className="h-3.5 w-3.5" /> เช็คอิน-เช็คเอาท์ครบแล้ว
                      </span>
                    )}
                  </div>
                )}

                {canCheckin && r.type === "wfh" && (
                  <div className="flex flex-wrap items-center gap-2">
                    {!hasMorning && (
                      <WfhCheckinButton
                        fieldRequestId={r.id}
                        kind="wfh_morning"
                        label="เช็คอินเช้า"
                        icon={Sunrise}
                      />
                    )}
                    {!hasEvening && (
                      <WfhCheckinButton
                        fieldRequestId={r.id}
                        kind="wfh_evening"
                        label="เช็คอินเย็น"
                        icon={Sunset}
                      />
                    )}
                    {hasMorning && hasEvening && (
                      <span className="flex items-center gap-1 text-xs text-success">
                        <Check className="h-3.5 w-3.5" /> เช็คอินครบแล้ว
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <FieldRequestSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        locations={locations}
        existing={
          editing && editing.type !== "ot"
            ? {
                id: editing.id,
                type: editing.type as "offsite" | "wfh",
                location_id: editing.location_id,
                work_date: editing.work_date,
                planned_start: editing.planned_start,
                planned_end: editing.planned_end,
                reason: editing.reason,
              }
            : null
        }
      />
    </div>
  );
}
