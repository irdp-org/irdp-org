"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, X, ChevronRight, FileText, Search } from "lucide-react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "@/components/shell/EmptyState";
import { LeaveRequestSheet } from "./LeaveRequestSheet";
import { LEAVE_LABELS_TH, LEAVE_STATUS_LABELS_TH } from "@/lib/leave";
import { cancelLeaveRequest } from "@/app/(app)/leave/actions";
import { CalendarDays } from "lucide-react";

export type OwnLeaveRequest = {
  id: string;
  leave_code: "sick" | "personal" | "vacation";
  start_at: string;
  end_at: string;
  hours: number;
  status: "draft" | "submitted" | "approved" | "rejected" | "returned" | "cancelled";
  reason: string | null;
  cert_url?: string | null;
  returnNote?: string | null;
};

const STATUS_VARIANT: Record<OwnLeaveRequest["status"], "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  submitted: "secondary",
  approved: "default",
  rejected: "destructive",
  returned: "destructive",
  cancelled: "outline",
};

export function LeaveRequestsClient({ requests }: { requests: OwnLeaveRequest[] }) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<OwnLeaveRequest | null>(null);
  const [detailItem, setDetailItem] = useState<OwnLeaveRequest | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  const filtered = requests.filter((r) => {
    if (filterType !== "all" && r.leave_code !== filterType) return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    return true;
  });

  function handleCancel(id: string) {
    startTransition(async () => {
      await cancelLeaveRequest(id);
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
        <Plus className="h-4 w-4" /> ยื่นคำขอลา
      </Button>

      {/* Filter row */}
      {requests.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-sm">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-transparent text-sm text-foreground outline-none"
            >
              <option value="all">ประเภทลาทั้งหมด</option>
              {Object.entries(LEAVE_LABELS_TH).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-sm">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-transparent text-sm text-foreground outline-none"
            >
              <option value="all">สถานะทั้งหมด</option>
              {Object.entries(LEAVE_STATUS_LABELS_TH).map(([s, label]) => (
                <option key={s} value={s}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={CalendarDays} title={requests.length === 0 ? "ยังไม่มีคำขอลา" : "ไม่พบรายการที่ตรงกับตัวกรอง"} />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((r) => {
            const editable = r.status === "draft" || r.status === "returned";
            const cancellable = r.status !== "approved" && r.status !== "cancelled" && r.status !== "rejected";
            return (
              <li key={r.id} className="flex flex-col rounded-xl border border-border bg-surface">
                {/* Tappable row → opens detail sheet */}
                <button
                  type="button"
                  className="flex items-center justify-between gap-3 px-4 py-3 text-left"
                  onClick={() => setDetailItem(r)}
                >
                  <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                    <span className="font-medium text-foreground">{LEAVE_LABELS_TH[r.leave_code]}</span>
                    <span className="text-muted-foreground">
                      {format(new Date(r.start_at), "d MMM")} – {format(new Date(r.end_at), "d MMM yyyy")} ·{" "}
                      {r.hours} ชม.
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={STATUS_VARIANT[r.status]}>{LEAVE_STATUS_LABELS_TH[r.status]}</Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>

                {/* Action row (edit / cancel) */}
                {(editable || cancellable) && (
                  <div className="flex items-center gap-1 border-t border-border px-3 py-1.5">
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
                            <AlertDialogTitle>ยกเลิกคำขอลานี้?</AlertDialogTitle>
                            <AlertDialogDescription>
                              ยกเลิกแล้วต้องยื่นคำขอใหม่หากต้องการลาช่วงนี้
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
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Detail sheet */}
      <Sheet open={!!detailItem} onOpenChange={(open) => !open && setDetailItem(null)}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          {detailItem && (
            <>
              <SheetHeader>
                <SheetTitle>{LEAVE_LABELS_TH[detailItem.leave_code]}</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-3 px-4 pb-6 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">สถานะ</span>
                  <Badge variant={STATUS_VARIANT[detailItem.status]}>{LEAVE_STATUS_LABELS_TH[detailItem.status]}</Badge>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground shrink-0">ช่วงเวลา</span>
                  <span className="text-foreground text-right">
                    {format(new Date(detailItem.start_at), "d MMM yyyy HH:mm")} –{" "}
                    {format(new Date(detailItem.end_at), "d MMM yyyy HH:mm")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">จำนวนชั่วโมง</span>
                  <span className="text-foreground">{detailItem.hours} ชม. ({(detailItem.hours / 7.5).toFixed(2)} วัน)</span>
                </div>
                {detailItem.reason && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">เหตุผล</span>
                    <span className="text-foreground">{detailItem.reason}</span>
                  </div>
                )}
                {detailItem.returnNote && (
                  <div className="rounded-xl bg-warning/10 px-3 py-2 text-xs text-foreground">
                    <span className="font-medium">หมายเหตุตีกลับ:</span> {detailItem.returnNote}
                  </div>
                )}
                {detailItem.cert_url && (
                  <div className="flex flex-col gap-2">
                    <span className="text-muted-foreground">ไฟล์แนบ</span>
                    {/\.(jpg|jpeg|png|webp|heic|heif)$/i.test(detailItem.cert_url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={detailItem.cert_url}
                        alt="ใบรับรองแพทย์"
                        className="max-h-64 w-full rounded-xl border border-border object-contain"
                      />
                    ) : (
                      <a
                        href={detailItem.cert_url}
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
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <LeaveRequestSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        existing={
          editing
            ? {
                id: editing.id,
                leave_code: editing.leave_code,
                reason: editing.reason,
                returnNote: editing.status === "returned" ? editing.returnNote : null,
              }
            : null
        }
      />
    </div>
  );
}
