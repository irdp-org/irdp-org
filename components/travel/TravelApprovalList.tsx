"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, RotateCcw, ChevronRight, Receipt } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shell/EmptyState";
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

export function TravelApprovalList({ rows, role }: { rows: TravelApprovalRow[]; role: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<TravelApprovalRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const canDecide = ["dept_head", "admin", "exec"].includes(role);

  const pending = rows.filter((r) => r.status === "submitted");
  const others = rows.filter((r) => r.status !== "submitted");

  function decide(id: string, decision: "approved" | "rejected" | "returned") {
    startTransition(async () => {
      await decideClaim(id, decision);
      setDetail(null);
      router.refresh();
    });
  }

  if (rows.length === 0) return <EmptyState icon={Receipt} title="ยังไม่มีเอกสารเบิกค่าเดินทาง" />;

  const renderRow = (r: TravelApprovalRow) => (
    <li key={r.id} className="rounded-xl border border-border bg-surface">
      <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setDetail(r)}>
        <div className="flex min-w-0 flex-col gap-0.5 text-sm">
          <span className="font-medium text-foreground">{r.employee_name}</span>
          <span className="text-muted-foreground">
            {r.title || "ค่าเดินทาง"} · {r.items.length} รายการ · {formatBaht(r.total_amount)} บาท
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={STATUS_VARIANT[r.status]}>{LEAVE_STATUS_LABELS_TH[r.status]}</Badge>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </button>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-foreground">รออนุมัติ ({pending.length})</p>
          <ul className="flex flex-col gap-2">{pending.map(renderRow)}</ul>
        </div>
      )}
      {others.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-muted-foreground">ประวัติ</p>
          <ul className="flex flex-col gap-2">{others.map(renderRow)}</ul>
        </div>
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
