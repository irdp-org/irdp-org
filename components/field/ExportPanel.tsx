"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { FIELD_TYPE_LABELS_TH } from "@/lib/ot";
import { buildCsv, triggerDownload } from "@/lib/export-csv";
import type { FieldApprovalQueueRow } from "./FieldApprovalList";

function buildExportCsv(rows: FieldApprovalQueueRow[]): string {
  return buildCsv(
    ["พนักงาน", "ประเภท", "วันที่", "เวลาเข้า", "เวลาออก", "OT รวม", "x1", "x1.5", "x3"],
    rows.map((r) => [
      r.employee.full_name,
      FIELD_TYPE_LABELS_TH[r.type as "offsite" | "wfh"] ?? r.type,
      r.work_date,
      r.planned_start ? format(new Date(r.planned_start), "HH:mm") : "",
      r.planned_end ? format(new Date(r.planned_end), "HH:mm") : "",
      r.ot_hours ?? 0,
      r.pay_x1_hours,
      r.pay_x15_hours,
      r.pay_x3_hours,
    ])
  );
}

export function ExportPanel({ rows }: { rows: FieldApprovalQueueRow[] }) {
  const exportable = rows.filter((r) => r.status === "approved");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (exportable.length === 0) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDownload() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const selectedRows = rows.filter((r) => selected.has(r.id));
    triggerDownload(`field-export-${format(new Date(), "yyyy-MM-dd")}.csv`, buildExportCsv(selectedRows));
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border bg-surface p-3">
      <p className="text-sm font-medium text-foreground">ดาวน์โหลดเป็น CSV ({exportable.length} รายการ)</p>
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
      <Button
        type="button"
        size="sm"
        className="self-start"
        disabled={selected.size === 0}
        onClick={handleDownload}
      >
        <Download className="h-4 w-4" /> ดาวน์โหลดเป็น CSV ({selected.size})
      </Button>
    </div>
  );
}
