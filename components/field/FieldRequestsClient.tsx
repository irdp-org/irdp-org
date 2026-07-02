"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, X, MapPin, ChevronRight } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shell/EmptyState";
import { FieldRequestSheet } from "./FieldRequestSheet";
import { FIELD_TYPE_LABELS_TH, FIELD_STATUS_LABELS_TH } from "@/lib/ot";
import { cancelFieldRequest } from "@/app/(app)/field/actions";
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

const FIELD_TYPE_LABELS_FULL: Record<string, string> = {
  offsite: "ปฏิบัติงานนอกสถานที่",
  wfh: "ทำงานที่บ้าน (WFH)",
  ot: "ล่วงเวลา (OT)",
};

const STATUS_VARIANT: Record<RequestStatusT, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  submitted: "secondary",
  approved: "default",
  rejected: "destructive",
  returned: "destructive",
  cancelled: "outline",
};

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
  const [detailItem, setDetailItem] = useState<OwnFieldRequest | null>(null);
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
            const editable = r.status === "draft" || r.status === "returned" || r.status === "submitted";
            const cancellable = r.status !== "approved" && r.status !== "cancelled" && r.status !== "rejected";

            return (
              <li
                key={r.id}
                className="flex flex-col rounded-xl border border-border bg-surface"
              >
                {/* Tappable summary row → opens detail dialog */}
                <button
                  type="button"
                  className="flex items-center justify-between gap-3 px-4 py-3 text-left"
                  onClick={() => setDetailItem(r)}
                >
                  <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                    <span className="font-medium text-foreground">
                      {FIELD_TYPE_LABELS_TH[r.type as "offsite" | "wfh"] ?? r.type}
                      {r.location_name ? ` · ${r.location_name}` : ""}
                    </span>
                    <span className="text-muted-foreground">
                      {format(new Date(r.work_date), "d MMM yyyy")}
                      {r.planned_start && r.planned_end && (
                        <> · {format(new Date(r.planned_start), "HH:mm")}–{format(new Date(r.planned_end), "HH:mm")}</>
                      )}
                      {r.ot_hours ? ` · OT ${r.ot_hours} ชม.` : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={STATUS_VARIANT[r.status]}>{FIELD_STATUS_LABELS_TH[r.status]}</Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>

                {/* Action row — edit / cancel (เช็คอิน/เช็คเอาท์ ทำที่หน้าเช็คอิน) */}
                {(editable || cancellable) && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
                    {editable && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-xs"
                        onClick={() => { setEditing(r); setSheetOpen(true); }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> แก้ไข
                      </Button>
                    )}
                    {cancellable && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs text-danger" disabled={isPending}>
                            <X className="h-3.5 w-3.5" /> ยกเลิก
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>ยกเลิกคำขอนี้?</AlertDialogTitle>
                            <AlertDialogDescription>ยกเลิกแล้วต้องยื่นคำขอใหม่หากต้องการช่วงนี้</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>ปิด</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleCancel(r.id)}>ยกเลิกคำขอ</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detailItem} onOpenChange={(open) => !open && setDetailItem(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          {detailItem && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {FIELD_TYPE_LABELS_FULL[detailItem.type] ?? detailItem.type}
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">สถานะ</span>
                  <Badge variant={STATUS_VARIANT[detailItem.status]}>{FIELD_STATUS_LABELS_TH[detailItem.status]}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">วันที่</span>
                  <span className="text-foreground">{format(new Date(detailItem.work_date), "d MMM yyyy")}</span>
                </div>
                {detailItem.planned_start && detailItem.planned_end && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">เวลา</span>
                    <span className="text-foreground">
                      {format(new Date(detailItem.planned_start), "HH:mm")} – {format(new Date(detailItem.planned_end), "HH:mm")} น.
                    </span>
                  </div>
                )}
                {detailItem.ot_hours != null && detailItem.ot_hours > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">ชั่วโมง OT</span>
                    <span className="font-medium text-foreground">{detailItem.ot_hours} ชม.</span>
                  </div>
                )}
                {detailItem.location_name && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">สถานที่</span>
                    <span className="text-foreground">{detailItem.location_name}</span>
                  </div>
                )}
                {detailItem.reason && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">เหตุผล / รายละเอียด</span>
                    <span className="text-foreground">{detailItem.reason}</span>
                  </div>
                )}
                {(detailItem.checkins ?? []).length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-muted-foreground">บันทึกเช็คอิน</span>
                    {(detailItem.checkins ?? []).map((c, i) => {
                      const kindLabel: Record<string, string> = {
                        in: "เช็คอิน",
                        out: "เช็คเอาท์",
                        wfh_morning: "เช็คอินเช้า",
                        wfh_evening: "เช็คอินเย็น",
                      };
                      return (
                        <div key={i} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-xs">
                          <span className="font-medium text-foreground">{kindLabel[c.kind] ?? c.kind}</span>
                          <span className="text-muted-foreground">{format(new Date(c.happened_at), "HH:mm น.")}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

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
