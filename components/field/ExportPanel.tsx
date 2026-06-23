"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { FIELD_TYPE_LABELS_TH } from "@/lib/ot";
import { markExported } from "@/app/(app)/field/approval-actions";
import type { FieldApprovalQueueRow } from "./FieldApprovalList";

function toCsv(rows: FieldApprovalQueueRow[]): string {
  const header = ["พนักงาน", "ประเภท", "วันที่", "เวลาเข้า", "เวลาออก", "OT รวม", "x1", "x1.5", "x3"];
  const lines = rows.map((r) =>
    [
      r.employee.full_name,
      FIELD_TYPE_LABELS_TH[r.type as "offsite" | "wfh"] ?? r.type,
      r.work_date,
      r.planned_start ? format(new Date(r.planned_start), "HH:mm") : "",
      r.planned_end ? format(new Date(r.planned_end), "HH:mm") : "",
      r.ot_hours ?? 0,
      r.pay_x1_hours,
      r.pay_x15_hours,
      r.pay_x3_hours,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

export function ExportPanel({ rows }: { rows: FieldApprovalQueueRow[] }) {
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
      const res = await markExported(ids);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      const selectedRows = rows.filter((r) => selected.has(r.id));
      const csv = toCsv(selectedRows);
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `field-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
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
              {r.employee.full_name} · {FIELD_TYPE_LABELS_TH[r.type as "offsite" | "wfh"] ?? r.type} ·{" "}
              {r.work_date}
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
