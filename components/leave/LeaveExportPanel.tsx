"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { buildCsv, triggerDownload } from "@/lib/export-csv";
import { markLeaveExported } from "@/app/(app)/leave/approval-actions";
import { LEAVE_LABELS_TH } from "@/lib/leave";
import type { ApprovalQueueRow } from "./ApprovalList";

function buildExportCsv(rows: ApprovalQueueRow[]): string {
  return buildCsv(
    ["พนักงาน", "ประเภทลา", "วันที่เริ่ม", "วันที่สิ้นสุด", "จำนวน (ชม.)", "เหตุผล"],
    rows.map((r) => [
      r.employee.full_name,
      LEAVE_LABELS_TH[r.leave_code] ?? r.leave_code,
      format(new Date(r.start_at), "yyyy-MM-dd"),
      format(new Date(r.end_at), "yyyy-MM-dd"),
      r.hours,
      r.reason ?? "",
    ])
  );
}

export function LeaveExportPanel({ rows }: { rows: ApprovalQueueRow[] }) {
  const router = useRouter();
  const exportable = rows.filter((r) => r.status === "approved" && !r.exported_at);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (exportable.length === 0) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleExport() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setError(null);
    startTransition(async () => {
      const res = await markLeaveExported(ids);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      const selectedRows = rows.filter((r) => selected.has(r.id));
      triggerDownload(`leave-export-${format(new Date(), "yyyy-MM-dd")}.csv`, buildExportCsv(selectedRows));
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border bg-surface p-3">
      <p className="text-sm font-medium text-foreground">ส่งออกให้การเงิน ({exportable.length} รายการรอส่งออก)</p>
      <ul className="flex flex-col gap-1">
        {exportable.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.has(r.id)}
              onChange={() => toggle(r.id)}
              className="h-4 w-4"
            />
            <span className="text-foreground">
              {r.employee.full_name} · {LEAVE_LABELS_TH[r.leave_code] ?? r.leave_code} ·{" "}
              {format(new Date(r.start_at), "d MMM")} · {r.hours} ชม.
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button
        type="button"
        size="sm"
        className="self-start"
        disabled={isPending || selected.size === 0}
        onClick={handleExport}
      >
        <Download className="h-4 w-4" /> Export ที่เลือก ({selected.size}) เป็น CSV
      </Button>
    </div>
  );
}
