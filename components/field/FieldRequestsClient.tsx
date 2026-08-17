"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, X, MapPin, ChevronRight, FileText } from "lucide-react";
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
import { SortableTable, type Column } from "@/components/shared/SortableTable";
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

/** Legacy imports embed an attachment link in the reason text as
 * "(เอกสารแนบ: <url>)" — pull it out so it renders as a real link instead of
 * plain text, and return the reason with that suffix stripped. */
function splitAttachment(reason: string | null): { text: string | null; url: string | null } {
  if (!reason) return { text: null, url: null };
  const m = reason.match(/\(เอกสารแนบ:\s*(https?:\/\/\S+)\)\s*$/);
  if (!m) return { text: reason, url: null };
  const text = reason.slice(0, m.index).trim();
  return { text: text || null, url: m[1] };
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
        (() => {
          const columns: Column<OwnFieldRequest>[] = [
            {
              key: "type",
              label: "ประเภท",
              sortValue: (r) => FIELD_TYPE_LABELS_TH[r.type as "offsite" | "wfh"] ?? r.type,
              render: (r) => (
                <span className="font-medium text-foreground">
                  {FIELD_TYPE_LABELS_TH[r.type as "offsite" | "wfh"] ?? r.type}
                </span>
              ),
            },
            {
              key: "work_date",
              label: "วันที่",
              sortValue: (r) => r.work_date,
              render: (r) => <span className="whitespace-nowrap text-foreground">{format(new Date(r.work_date), "d MMM yyyy")}</span>,
            },
            {
              key: "time",
              label: "เวลา",
              sortValue: (r) => r.planned_start ?? "",
              render: (r) =>
                r.planned_start && r.planned_end ? (
                  <span className="whitespace-nowrap text-foreground">
                    {format(new Date(r.planned_start), "HH:mm")}–{format(new Date(r.planned_end), "HH:mm")}
                  </span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                ),
            },
            {
              key: "location",
              label: "สถานที่",
              sortValue: (r) => r.location_name ?? "",
              render: (r) => <span className="text-foreground">{r.location_name || "-"}</span>,
            },
            {
              key: "ot_hours",
              label: "OT ชม.",
              sortValue: (r) => r.ot_hours ?? 0,
              render: (r) => <span className="text-foreground">{r.ot_hours ? `${r.ot_hours} ชม.` : "-"}</span>,
            },
            {
              key: "reason",
              label: "เหตุผล",
              sortValue: (r) => splitAttachment(r.reason).text ?? "",
              render: (r) => <span className="text-muted-foreground">{splitAttachment(r.reason).text ?? "-"}</span>,
              className: "max-w-[220px]",
            },
            {
              key: "status",
              label: "สถานะ",
              sortValue: (r) => r.status,
              render: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{FIELD_STATUS_LABELS_TH[r.status]}</Badge>,
            },
            {
              key: "attachment",
              label: "ไฟล์แนบ",
              render: (r) => {
                const { url: attachmentUrl } = splitAttachment(r.reason);
                if (!attachmentUrl) return <span className="text-muted-foreground">-</span>;
                return (
                  <a
                    href={attachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <FileText className="h-4 w-4" /> เปิดไฟล์
                  </a>
                );
              },
            },
            {
              key: "actions",
              label: "จัดการ",
              render: (r) => {
                const editable = r.status === "draft" || r.status === "returned" || r.status === "submitted";
                const cancellable = r.status !== "approved" && r.status !== "cancelled" && r.status !== "rejected";
                return (
                  <div className="flex flex-wrap items-center gap-1">
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
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                );
              },
            },
          ];
          return (
            <SortableTable
              columns={columns}
              rows={requests}
              rowKey={(r) => r.id}
              onRowClick={(r) => setDetailItem(r)}
            />
          );
        })()
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
                {(() => {
                  const { text: reasonText, url: attachmentUrl } = splitAttachment(detailItem.reason);
                  const isImage = !!attachmentUrl && /\.(jpg|jpeg|png|webp|heic|heif)(\?|$)/i.test(attachmentUrl);
                  return (
                    <>
                      {reasonText && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground">เหตุผล / รายละเอียด</span>
                          <span className="text-foreground">{reasonText}</span>
                        </div>
                      )}
                      {attachmentUrl && (
                        <div className="flex flex-col gap-2">
                          <span className="text-muted-foreground">ไฟล์แนบ</span>
                          {isImage ? (
                            <a href={attachmentUrl} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={attachmentUrl}
                                alt="เอกสารแนบ"
                                className="max-h-64 w-full rounded-xl border border-border object-contain"
                              />
                            </a>
                          ) : (
                            <a
                              href={attachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-primary"
                            >
                              <FileText className="h-4 w-4 shrink-0" />
                              เปิดไฟล์แนบ
                            </a>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
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
