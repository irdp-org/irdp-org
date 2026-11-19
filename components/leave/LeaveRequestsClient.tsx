"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, X, ChevronRight, FileText } from "lucide-react";
import { format } from "date-fns";
import { formatThaiDate, bkkYearMonth, bkkDateKey } from "@/lib/format-th";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestFilterBar } from "@/components/shared/RequestFilterBar";
import { MonthlyBars, SummaryTile, YearSelect, type BarSeries } from "@/components/shared/summary";
import { LeaveRequestSheet } from "./LeaveRequestSheet";
import { LEAVE_LABELS_TH, LEAVE_STATUS_LABELS_TH } from "@/lib/leave";
import { cancelLeaveRequest, generateLeaveDoc } from "@/app/(app)/leave/actions";
import { GenerateDocButton } from "@/components/booking/GenerateDocButton";
import { CalendarDays } from "lucide-react";
import type { LeaveCodeT } from "@/lib/database.types";

export type LeaveBalanceRow = {
  leave_code: LeaveCodeT;
  entitled_hours: number;
  carried_hours: number;
  used_hours: number;
  available_hours: number;
};

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

const LEAVE_SERIES: BarSeries[] = [
  { key: "sick", label: "ลาป่วย", className: "bg-warning" },
  { key: "personal", label: "ลากิจ", className: "bg-primary" },
  { key: "vacation", label: "ลาพักร้อน", className: "bg-success" },
];

const STATUS_VARIANT: Record<OwnLeaveRequest["status"], "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  submitted: "secondary",
  approved: "default",
  rejected: "destructive",
  returned: "destructive",
  cancelled: "outline",
};

export function LeaveRequestsClient({
  requests,
  balances = [],
  year = new Date().getFullYear(),
}: {
  requests: OwnLeaveRequest[];
  balances?: LeaveBalanceRow[];
  year?: number;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<OwnLeaveRequest | null>(null);
  const [detailItem, setDetailItem] = useState<OwnLeaveRequest | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");
  const [filterSearch, setFilterSearch] = useState<string>("");
  const [chartYear, setChartYear] = useState<number>(year);
  const [isPending, startTransition] = useTransition();
  const [cancelError, setCancelError] = useState<string | null>(null);

  const filtered = requests.filter((r) => {
    if (filterType !== "all" && r.leave_code !== filterType) return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    // Overlap check, not strict containment — a multi-day leave that merely
    // crosses into the selected range should still show up, not just ones
    // that start and end fully inside it.
    const startDate = bkkDateKey(r.start_at);
    const endDate = bkkDateKey(r.end_at);
    if (filterFrom && endDate < filterFrom) return false;
    if (filterTo && startDate > filterTo) return false;
    const needle = filterSearch.trim().toLowerCase();
    if (needle && !(splitAttachment(r.reason).text ?? "").toLowerCase().includes(needle)) return false;
    return true;
  });

  // Monthly dashboard — approved leave hours per month by type for the chosen
  // year, attributed to the month the leave starts in (Bangkok time).
  const chartYears = useMemo(
    () => Array.from(new Set([year, ...requests.map((r) => bkkYearMonth(r.start_at).y)])).sort((a, b) => b - a),
    [requests, year]
  );
  const chartYearRequests = requests.filter((r) => bkkYearMonth(r.start_at).y === chartYear);
  const monthlyValues = Array.from({ length: 12 }, (_, m) => {
    const v = { sick: 0, personal: 0, vacation: 0 };
    for (const r of chartYearRequests) {
      if (r.status === "approved" && bkkYearMonth(r.start_at).m === m) v[r.leave_code] += r.hours;
    }
    return v;
  });
  const countByStatus = (...statuses: OwnLeaveRequest["status"][]) =>
    chartYearRequests.filter((r) => statuses.includes(r.status)).length;

  const balanceByCode = new Map(balances.map((b) => [b.leave_code, b]));
  const usedThisYearHours = requests
    .filter((r) => r.status === "approved" && new Date(r.start_at).getFullYear() === year)
    .reduce((sum, r) => sum + r.hours, 0);

  function handleCancel(id: string) {
    setCancelError(null);
    startTransition(async () => {
      const res = await cancelLeaveRequest(id);
      if (res && "error" in res && res.error) {
        setCancelError(res.error);
        return;
      }
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

      {cancelError && <p className="text-sm text-danger">{cancelError}</p>}

      {/* Summary dashboard — balance per leave type for the year */}
      {balances.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(["sick", "personal", "vacation"] as const).map((code) => {
            const b = balanceByCode.get(code);
            const entitledHours = (b?.entitled_hours ?? 0) + (b?.carried_hours ?? 0);
            const usedHours = b?.used_hours ?? 0;
            const availableHours = b?.available_hours ?? entitledHours;
            return (
              <div key={code} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm font-medium text-foreground">{LEAVE_LABELS_TH[code]} ({year})</p>
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {(availableHours / 7.5).toFixed(1).replace(/\.0$/, "")} <span className="text-sm font-normal text-muted-foreground">วันคงเหลือ</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  ใช้ไปแล้ว {usedHours} ชม. ({(usedHours / 7.5).toFixed(1).replace(/\.0$/, "")} วัน) จากสิทธิ์ {entitledHours} ชม.
                </p>
              </div>
            );
          })}
          <div className="rounded-xl border border-border bg-surface p-4 sm:col-span-3">
            <p className="text-sm font-medium text-foreground">รวมทุกประเภทที่ลาไปแล้ว ({year})</p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {usedThisYearHours} ชม. ({(usedThisYearHours / 7.5).toFixed(1).replace(/\.0$/, "")} วัน)
            </p>
          </div>
        </div>
      )}

      {/* Monthly summary — hours per month by leave type + request status counts */}
      {requests.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm">สรุปการลารายเดือน (อนุมัติแล้ว)</CardTitle>
            <YearSelect value={chartYear} years={chartYears} onChange={setChartYear} />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              <SummaryTile label="รออนุมัติ" value={countByStatus("submitted")} unit="ใบ" />
              <SummaryTile label="อนุมัติแล้ว" value={countByStatus("approved")} unit="ใบ" />
              <SummaryTile label="ตีกลับ/ไม่อนุมัติ" value={countByStatus("returned", "rejected")} unit="ใบ" />
            </div>
            <MonthlyBars values={monthlyValues} series={LEAVE_SERIES} unit=" ชม." />
          </CardContent>
        </Card>
      )}

      {/* Filter row */}
      {requests.length > 0 && (
        <RequestFilterBar
          search={filterSearch}
          onSearch={setFilterSearch}
          searchPlaceholder="ค้นหาเหตุผล / เรื่องที่ลา..."
          selects={[
            { key: "type", value: filterType, onChange: setFilterType, allLabel: "ประเภทลาทั้งหมด", options: Object.entries(LEAVE_LABELS_TH).map(([value, label]) => ({ value, label })) },
            { key: "status", value: filterStatus, onChange: setFilterStatus, allLabel: "สถานะทั้งหมด", options: Object.entries(LEAVE_STATUS_LABELS_TH).map(([value, label]) => ({ value, label })) },
          ]}
          from={filterFrom}
          to={filterTo}
          onFrom={setFilterFrom}
          onTo={setFilterTo}
          shown={filtered.length}
          total={requests.length}
          active={filterType !== "all" || filterStatus !== "all" || !!filterFrom || !!filterTo || !!filterSearch}
          onClear={() => {
            setFilterType("all");
            setFilterStatus("all");
            setFilterFrom("");
            setFilterTo("");
            setFilterSearch("");
          }}
        />
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={CalendarDays} title={requests.length === 0 ? "ยังไม่มีคำขอลา" : "ไม่พบรายการที่ตรงกับตัวกรอง"} />
      ) : (
        (() => {
          const columns: Column<OwnLeaveRequest>[] = [
            {
              key: "leave_code",
              label: "ประเภทลา",
              sortValue: (r) => LEAVE_LABELS_TH[r.leave_code],
              render: (r) => <span className="font-medium text-foreground">{LEAVE_LABELS_TH[r.leave_code]}</span>,
            },
            {
              key: "start_at",
              label: "ช่วงวันที่",
              sortValue: (r) => r.start_at,
              render: (r) => (
                <span className="whitespace-nowrap text-foreground">
                  {formatThaiDate(new Date(r.start_at), { day: "numeric", month: "short" })} – {formatThaiDate(new Date(r.end_at))}
                </span>
              ),
            },
            {
              key: "hours",
              label: "ชั่วโมง",
              sortValue: (r) => r.hours,
              render: (r) => <span className="text-foreground">{r.hours} ชม.</span>,
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
              render: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{LEAVE_STATUS_LABELS_TH[r.status]}</Badge>,
            },
            {
              key: "attachment",
              label: "ไฟล์แนบ",
              render: (r) => {
                const { url: embeddedUrl } = splitAttachment(r.reason);
                const attachmentUrl = r.cert_url || embeddedUrl;
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
                const editable = r.status === "draft" || r.status === "returned";
                const cancellable = r.status !== "approved" && r.status !== "cancelled" && r.status !== "rejected";
                return (
                  <div className="flex items-center gap-1">
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
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                );
              },
            },
          ];
          return (
            <SortableTable
              columns={columns}
              rows={filtered}
              rowKey={(r) => r.id}
              onRowClick={(r) => setDetailItem(r)}
            />
          );
        })()
      )}

      {/* Detail dialog — full-screen on mobile, centered on desktop */}
      <Dialog open={!!detailItem} onOpenChange={(open) => !open && setDetailItem(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          {detailItem && (
            <>
              <DialogHeader>
                <DialogTitle>{LEAVE_LABELS_TH[detailItem.leave_code]}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">สถานะ</span>
                  <Badge variant={STATUS_VARIANT[detailItem.status]}>{LEAVE_STATUS_LABELS_TH[detailItem.status]}</Badge>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground shrink-0">ช่วงเวลา</span>
                  <span className="text-foreground text-right">
                    {formatThaiDate(new Date(detailItem.start_at))} {format(new Date(detailItem.start_at), "HH:mm")} –{" "}
                    {formatThaiDate(new Date(detailItem.end_at))} {format(new Date(detailItem.end_at), "HH:mm")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">จำนวนชั่วโมง</span>
                  <span className="text-foreground">{detailItem.hours} ชม. ({(detailItem.hours / 7.5).toFixed(2)} วัน)</span>
                </div>
                {(() => {
                  const { text: reasonText, url: embeddedUrl } = splitAttachment(detailItem.reason);
                  const attachmentUrl = detailItem.cert_url || embeddedUrl;
                  const isImage = !!attachmentUrl && /\.(jpg|jpeg|png|webp|heic|heif)(\?|$)/i.test(attachmentUrl);
                  return (
                    <>
                      {reasonText && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground">เหตุผล / เรื่องที่ลา</span>
                          <span className="text-foreground">{reasonText}</span>
                        </div>
                      )}
                      {detailItem.returnNote && (
                        <div className="rounded-xl bg-warning/10 px-3 py-2 text-xs text-foreground">
                          <span className="font-medium">หมายเหตุตีกลับ:</span> {detailItem.returnNote}
                        </div>
                      )}
                      <div className="flex items-center justify-between border-t border-border pt-3">
                        <span className="text-sm text-muted-foreground">ออกใบลา (Google Doc)</span>
                        <GenerateDocButton id={detailItem.id} generate={generateLeaveDoc} label="ออกใบลา" />
                      </div>
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
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

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
