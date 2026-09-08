"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, RotateCcw, Receipt } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shell/EmptyState";
import { SortableTable, type Column } from "@/components/shared/SortableTable";
import { LEAVE_STATUS_LABELS_TH } from "@/lib/leave";
import { MODE_LABELS, formatBaht } from "@/lib/travel";
import { decideClaim, generateTravelDoc } from "@/app/(app)/travel-expense/actions";
import { GenerateDocButton } from "@/components/booking/GenerateDocButton";
import type { RequestStatusT } from "@/lib/database.types";
import type { TravelItem } from "./TravelExpenseClient";

export type TravelApprovalRow = {
  id: string;
  title: string | null;
  status: RequestStatusT;
  total_amount: number;
  created_at: string;
  attachment_urls: string[];
  employee_name: string;
  items: TravelItem[];
};

const STATUS_VARIANT: Record<RequestStatusT, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  submitted: "secondary",
  approved: "default",
  rejected: "destructive",
  returned: "destructive",
  cancelled: "outline",
};

const ALL_FILTER = "ทั้งหมด";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold text-foreground">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

export function TravelApprovalList({ rows, role }: { rows: TravelApprovalRow[]; role: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<TravelApprovalRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState(ALL_FILTER);
  const [yearFilter, setYearFilter] = useState(ALL_FILTER);
  const [search, setSearch] = useState("");
  const canDecide = ["dept_head", "admin", "exec"].includes(role);

  function decide(id: string, decision: "approved" | "rejected" | "returned") {
    startTransition(async () => {
      await decideClaim(id, decision);
      setDetail(null);
      router.refresh();
    });
  }

  if (rows.length === 0) return <EmptyState icon={Receipt} title="ยังไม่มีเอกสารเบิกค่าเดินทาง" />;

  const pendingRows = rows.filter((r) => r.status === "submitted");
  const approvedRows = rows.filter((r) => r.status === "approved");
  const pendingTotal = pendingRows.reduce((s, r) => s + r.total_amount, 0);
  const approvedTotal = approvedRows.reduce((s, r) => s + r.total_amount, 0);

  const years = [...new Set(rows.map((r) => String(new Date(r.created_at).getFullYear() + 543)))].sort((a, b) => Number(b) - Number(a));
  const searchLower = search.trim().toLowerCase();
  const visibleRows = rows
    .filter((r) => statusFilter === ALL_FILTER || r.status === statusFilter)
    .filter((r) => yearFilter === ALL_FILTER || String(new Date(r.created_at).getFullYear() + 543) === yearFilter)
    .filter((r) => !searchLower || r.employee_name.toLowerCase().includes(searchLower) || (r.title ?? "").toLowerCase().includes(searchLower));

  const columns: Column<TravelApprovalRow>[] = [
    {
      key: "employee_name",
      label: "พนักงาน",
      sortValue: (r) => r.employee_name,
      render: (r) => <span className="font-medium text-foreground">{r.employee_name}</span>,
    },
    {
      key: "title",
      label: "ชื่อเรื่อง",
      sortValue: (r) => r.title ?? "",
      render: (r) => <span className="text-foreground">{r.title || "ค่าเดินทาง"}</span>,
    },
    {
      key: "items",
      label: "รายการ",
      sortValue: (r) => r.items.length,
      render: (r) => <span className="text-foreground">{r.items.length} รายการ</span>,
    },
    {
      key: "total_amount",
      label: "จำนวนเงิน",
      sortValue: (r) => r.total_amount,
      render: (r) => <span className="whitespace-nowrap text-foreground">{formatBaht(r.total_amount)} บาท</span>,
    },
    {
      key: "status",
      label: "สถานะ",
      sortValue: (r) => r.status,
      render: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{LEAVE_STATUS_LABELS_TH[r.status]}</Badge>,
    },
    {
      key: "created_at",
      label: "วันที่ยื่น",
      sortValue: (r) => r.created_at,
      render: (r) => <span className="whitespace-nowrap text-foreground">{format(new Date(r.created_at), "d MMM yyyy")}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatCard label="เอกสารทั้งหมด" value={String(rows.length)} />
        <StatCard label="อนุมัติแล้ว" value={`${formatBaht(approvedTotal)} บาท`} sub={`${approvedRows.length} ฉบับ`} />
        <StatCard label="รออนุมัติ" value={`${formatBaht(pendingTotal)} บาท`} sub={`${pendingRows.length} ฉบับ`} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value={ALL_FILTER}>ทุกสถานะ</option>
          {(Object.keys(LEAVE_STATUS_LABELS_TH) as RequestStatusT[]).map((s) => (
            <option key={s} value={s}>
              {LEAVE_STATUS_LABELS_TH[s]}
            </option>
          ))}
        </select>
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value={ALL_FILTER}>ทุกปี</option>
          {years.map((y) => (
            <option key={y} value={y}>
              ปี {y}
            </option>
          ))}
        </select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อพนักงาน, ชื่อเรื่อง..."
          className="sm:max-w-xs"
        />
      </div>

      {visibleRows.length === 0 ? (
        <EmptyState icon={Receipt} title="ไม่พบรายการ" description="ลองเปลี่ยนตัวกรองหรือคำค้นหา" />
      ) : (
        <SortableTable columns={columns} rows={visibleRows} rowKey={(r) => r.id} onRowClick={setDetail} />
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.title || "เอกสารเบิกค่าเดินทาง"}</DialogTitle>
              </DialogHeader>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">โดย {detail.employee_name}</p>
                <GenerateDocButton id={detail.id} generate={generateTravelDoc} label="ออกใบรับรองแทนใบเสร็จ" />
              </div>
              <div className="flex flex-col divide-y divide-border">
                {detail.items.map((it) => (
                  <div key={it.id} className="flex flex-col gap-0.5 py-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium text-foreground">{format(new Date(it.travel_date), "d MMM yyyy")}</span>
                      <span className="font-medium text-foreground">{formatBaht(it.amount)} บาท</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {[it.from_location, it.to_location].filter(Boolean).join(" → ")}
                      {" · "}{MODE_LABELS[it.mode] ?? it.mode}
                      {it.mode === "private_car" && it.km ? ` (${it.km} กม.)` : ""}
                    </span>
                    {it.note && <span className="text-xs text-muted-foreground">{it.note}</span>}
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
                <span>รวมทั้งสิ้น</span>
                <span>{formatBaht(detail.total_amount)} บาท</span>
              </div>
              {detail.attachment_urls.length > 0 && (
                <div className="flex flex-col gap-1.5 border-t border-border pt-2">
                  <span className="text-xs text-muted-foreground">หลักฐานแนบ ({detail.attachment_urls.length})</span>
                  <div className="grid grid-cols-3 gap-2">
                    {detail.attachment_urls.map((u, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={i} href={u} target="_blank" rel="noopener noreferrer">
                        <img src={u} alt={`หลักฐาน ${i + 1}`} className="aspect-square w-full rounded-lg border border-border object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {canDecide && detail.status === "submitted" && (
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" className="flex-1 gap-1" disabled={isPending} onClick={() => decide(detail.id, "returned")}>
                    <RotateCcw className="h-4 w-4" /> ตีกลับ
                  </Button>
                  <Button variant="outline" className="flex-1 gap-1 text-danger" disabled={isPending} onClick={() => decide(detail.id, "rejected")}>
                    <X className="h-4 w-4" /> ไม่อนุมัติ
                  </Button>
                  <Button className="flex-1 gap-1" disabled={isPending} onClick={() => decide(detail.id, "approved")}>
                    <Check className="h-4 w-4" /> อนุมัติ
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
