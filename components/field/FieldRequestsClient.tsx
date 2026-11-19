"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, X, MapPin, ChevronRight, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { formatThaiDate, bkkYearMonth } from "@/lib/format-th";
import { splitAttachment, isImageUrl } from "@/lib/attachment-link";
import { AttachmentList } from "@/components/shared/AttachmentList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestFilterBar } from "@/components/shared/RequestFilterBar";
import { MonthlyBars, SummaryTile, YearSelect, type BarSeries } from "@/components/shared/summary";
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
  location_text?: string | null;
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
  checkins?: {
    kind: CheckinKindT;
    happened_at: string;
    distance_m?: number | null;
    within_radius?: boolean | null;
    selfie_url?: string | null;
    photo_url?: string | null;
  }[];
  attachments?: { url: string; name: string; mimeType: string }[];
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

const FIELD_SERIES: BarSeries[] = [
  { key: "offsite", label: "นอกสถานที่", className: "bg-primary" },
  { key: "ot", label: "ปฏิบัติงานนอกเวลา", className: "bg-warning" },
  { key: "wfh", label: "WFH", className: "bg-success" },
];

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
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [chartYear, setChartYear] = useState(() => bkkYearMonth(new Date()).y);

  const filtered = requests.filter((r) => {
    if (typeFilter !== "all" && r.type !== typeFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (from && r.work_date < from) return false;
    if (to && r.work_date > to) return false;
    const needle = search.trim().toLowerCase();
    if (
      needle &&
      !(splitAttachment(r.reason).text ?? "").toLowerCase().includes(needle) &&
      !(r.location_name ?? r.location_text ?? "").toLowerCase().includes(needle)
    )
      return false;
    return true;
  });

  // Monthly dashboard — approved requests per month by type for the chosen year.
  const chartYears = useMemo(
    () => Array.from(new Set([bkkYearMonth(new Date()).y, ...requests.map((r) => Number(r.work_date.slice(0, 4)))])).sort((a, b) => b - a),
    [requests]
  );
  const yearRequests = requests.filter((r) => Number(r.work_date.slice(0, 4)) === chartYear);
  const approvedYear = yearRequests.filter((r) => r.status === "approved");
  const monthlyValues = Array.from({ length: 12 }, (_, m) => {
    const v = { offsite: 0, ot: 0, wfh: 0 };
    for (const r of approvedYear) {
      if (Number(r.work_date.slice(5, 7)) - 1 === m && r.type in v) v[r.type as keyof typeof v] += 1;
    }
    return v;
  });
  const countType = (t: string) => approvedYear.filter((r) => r.type === t).length;
  const otHoursYear = approvedYear.reduce((sum, r) => sum + (r.ot_hours ?? 0), 0);
  const pendingYear = yearRequests.filter((r) => r.status === "submitted").length;

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

      {/* Monthly summary */}
      {requests.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm">สรุปรายเดือน (อนุมัติแล้ว)</CardTitle>
            <YearSelect value={chartYear} years={chartYears} onChange={setChartYear} />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryTile label="นอกสถานที่" value={countType("offsite")} unit="ครั้ง" />
              <SummaryTile label="ปฏิบัติงานนอกเวลา" value={countType("ot")} unit="ครั้ง" hint={otHoursYear > 0 ? `OT รวม ${Math.round(otHoursYear * 10) / 10} ชม.` : undefined} />
              <SummaryTile label="WFH" value={countType("wfh")} unit="ครั้ง" />
              <SummaryTile label="รออนุมัติ" value={pendingYear} unit="รายการ" />
            </div>
            <MonthlyBars values={monthlyValues} series={FIELD_SERIES} unit=" ครั้ง" />
          </CardContent>
        </Card>
      )}

      {requests.length > 0 && (
        <RequestFilterBar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="ค้นหาสถานที่ / เหตุผล..."
          selects={[
            { key: "type", value: typeFilter, onChange: setTypeFilter, allLabel: "ทุกประเภท", options: Object.entries(FIELD_TYPE_LABELS_TH).map(([value, label]) => ({ value, label })) },
            { key: "status", value: statusFilter, onChange: setStatusFilter, allLabel: "ทุกสถานะ", options: Object.entries(FIELD_STATUS_LABELS_TH).map(([value, label]) => ({ value, label })) },
          ]}
          from={from}
          to={to}
          onFrom={setFrom}
          onTo={setTo}
          shown={filtered.length}
          total={requests.length}
          active={typeFilter !== "all" || statusFilter !== "all" || !!from || !!to || !!search}
          onClear={() => {
            setTypeFilter("all");
            setStatusFilter("all");
            setFrom("");
            setTo("");
            setSearch("");
          }}
        />
      )}

      {requests.length === 0 ? (
        <EmptyState icon={MapPin} title="ยังไม่มีคำขอนอกสถานที่/WFH" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={MapPin} title="ไม่พบรายการที่ตรงกับตัวกรอง" />
      ) : (
        (() => {
          const columns: Column<OwnFieldRequest>[] = [
            {
              key: "type",
              label: "ประเภท",
              sortValue: (r) => FIELD_TYPE_LABELS_TH[r.type as "offsite" | "wfh" | "ot"] ?? r.type,
              render: (r) => (
                <span className="font-medium text-foreground">
                  {FIELD_TYPE_LABELS_TH[r.type as "offsite" | "wfh" | "ot"] ?? r.type}
                </span>
              ),
            },
            {
              key: "work_date",
              label: "วันที่",
              sortValue: (r) => r.work_date,
              render: (r) => <span className="whitespace-nowrap text-foreground">{formatThaiDate(new Date(r.work_date))}</span>,
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
              sortValue: (r) => r.location_name ?? r.location_text ?? "",
              render: (r) => <span className="text-foreground">{r.location_name || r.location_text || "-"}</span>,
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
                const files = r.attachments ?? [];
                if (files.length > 0) {
                  return (
                    <div className="flex flex-col gap-0.5">
                      {files.map((f, i) => (
                        <a
                          key={i}
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <FileText className="h-4 w-4 shrink-0" /> {f.name}
                        </a>
                      ))}
                    </div>
                  );
                }
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
              rows={filtered}
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
                  <span className="text-foreground">{formatThaiDate(new Date(detailItem.work_date))}</span>
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
                {(detailItem.location_name || detailItem.location_text) && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="shrink-0 text-muted-foreground">สถานที่</span>
                    <span className="text-right text-foreground">{detailItem.location_name ?? detailItem.location_text}</span>
                  </div>
                )}
                <AttachmentList files={detailItem.attachments ?? []} />
                {(() => {
                  const { text: reasonText, url: attachmentUrl } = splitAttachment(detailItem.reason);
                  const isImage = !!attachmentUrl && isImageUrl(attachmentUrl);
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
                        <div key={i} className="flex flex-col gap-1.5 rounded-lg bg-surface px-3 py-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">{kindLabel[c.kind] ?? c.kind}</span>
                            <span className="text-muted-foreground">{format(new Date(c.happened_at), "HH:mm น.")}</span>
                          </div>
                          {c.within_radius != null && (
                            <span
                              className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                c.within_radius ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                              }`}
                            >
                              {c.within_radius ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                              <MapPin className="h-3 w-3" />
                              {c.within_radius ? "อยู่ในรัศมี" : "อยู่นอกรัศมี"}
                              {c.distance_m != null && ` (ห่าง ${c.distance_m} ม.)`}
                            </span>
                          )}
                          {(c.selfie_url || c.photo_url) && (
                            <div className="flex gap-2">
                              {c.selfie_url && (
                                // eslint-disable-next-line @next/next/no-img-element -- signed URL, short-lived
                                <img
                                  src={c.selfie_url}
                                  alt="เซลฟี่"
                                  onClick={() => setLightbox(c.selfie_url!)}
                                  className="h-16 w-16 cursor-pointer rounded-lg object-cover"
                                />
                              )}
                              {c.photo_url && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={c.photo_url}
                                  alt="รูปหน้างาน"
                                  onClick={() => setLightbox(c.photo_url!)}
                                  className="h-16 w-16 cursor-pointer rounded-lg object-cover"
                                />
                              )}
                            </div>
                          )}
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

      {/* Photo lightbox */}
      <Dialog open={!!lightbox} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="max-w-2xl p-2">
          {lightbox && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lightbox} alt="รูปขยาย" className="max-h-[80vh] w-full rounded-lg object-contain" />
          )}
        </DialogContent>
      </Dialog>

      <FieldRequestSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        locations={locations}
        existing={
          editing
            ? {
                id: editing.id,
                type: editing.type as "offsite" | "wfh" | "ot",
                location_id: editing.location_id,
                location_text: editing.location_text,
                work_date: editing.work_date,
                planned_start: editing.planned_start,
                planned_end: editing.planned_end,
                reason: editing.reason,
                attachments: editing.attachments ?? [],
              }
            : null
        }
      />
    </div>
  );
}
