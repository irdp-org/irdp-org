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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (exportable.length === 0) return null;

  function handleExport() {
    setError(null);
    startTransition(async () => {
      const ids = exportable.map((r) => r.id);
      const res = await markLeaveExported(ids);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      triggerDownload(`leave-export-${format(new Date(), "yyyy-MM-dd")}.csv`, buildExportCsv(exportable));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="button" variant="outline" size="sm" className="gap-1.5 self-start" disabled={isPending} onClick={handleExport}>
        <Download className="h-4 w-4" /> ดาวน์โหลด CSV
      </Button>
    </div>
  );
}
