"use client";

import { FileText, ExternalLink } from "lucide-react";
import { EmptyState } from "@/components/shell/EmptyState";
import { SortableTable, type Column } from "@/components/shared/SortableTable";

export type IntakeLogRow = {
  id: string;
  seq: number;
  doc_no: string;
  ref_no: string | null;
  issued_date: string;
  from_name: string | null;
  recipient: string | null;
  title: string;
  handler_name: string;
  attachment_url: string | null;
};

export function IntakeLogClient({ rows }: { rows: IntakeLogRow[] }) {
  if (rows.length === 0) {
    return <EmptyState icon={FileText} title="ไม่มีรายการ" />;
  }

  const columns: Column<IntakeLogRow>[] = [
    {
      key: "seq",
      label: "ลำดับที่",
      sortValue: (r) => r.seq,
      render: (r) => <span className="text-muted-foreground">{r.seq}</span>,
    },
    {
      key: "doc_no",
      label: "เลขที่ลงรับ IRDP",
      sortValue: (r) => r.doc_no,
      render: (r) => <span className="whitespace-nowrap font-medium text-foreground">{r.doc_no}</span>,
    },
    {
      key: "ref_no",
      label: "ที่",
      sortValue: (r) => r.ref_no ?? "",
      render: (r) => <span className="whitespace-nowrap text-foreground">{r.ref_no ?? "-"}</span>,
    },
    {
      key: "issued_date",
      label: "ลงวันที่",
      sortValue: (r) => r.issued_date,
      render: (r) => (
        <span className="whitespace-nowrap text-foreground">
          {new Date(r.issued_date).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}
        </span>
      ),
    },
    {
      key: "from_name",
      label: "จาก",
      sortValue: (r) => r.from_name ?? "",
      render: (r) => <span className="text-foreground">{r.from_name ?? "-"}</span>,
    },
    {
      key: "recipient",
      label: "ถึง",
      sortValue: (r) => r.recipient ?? "",
      render: (r) => <span className="text-foreground">{r.recipient ?? "-"}</span>,
    },
    {
      key: "title",
      label: "เรื่อง",
      sortValue: (r) => r.title,
      render: (r) => <span className="text-foreground">{r.title}</span>,
      className: "max-w-[320px]",
    },
    {
      key: "handler_name",
      label: "การปฏิบัติ",
      sortValue: (r) => r.handler_name,
      render: (r) => <span className="text-foreground">{r.handler_name}</span>,
    },
    {
      key: "attachment",
      label: "ไฟล์แนบ",
      render: (r) =>
        r.attachment_url ? (
          <a
            href={r.attachment_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <ExternalLink className="h-4 w-4" /> เปิดไฟล์
          </a>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
  ];

  return <SortableTable columns={columns} rows={rows} rowKey={(r) => r.id} />;
}
