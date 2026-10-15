"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shell/EmptyState";
import { SortableTable, type Column } from "@/components/shared/SortableTable";
import { createIntakeLogEntry, updateIntakeLogEntry, deleteIntakeLogEntry } from "@/app/(app)/documents/intake-log-actions";

export type IntakeLogRow = {
  id: string;
  seq: number;
  doc_no: string;
  ref_no: string | null;
  issued_date: string;
  from_name: string | null;
  recipient: string | null;
  title: string;
  handler_id: string;
  handler_name: string;
  attachment_url: string | null;
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const ALL_TAB = "ทุกปี";

export function IntakeLogClient({
  categoryLabel,
  rows,
  employeeOptions,
  canDelete,
}: {
  categoryLabel: string;
  rows: IntakeLogRow[];
  employeeOptions: { id: string; full_name: string }[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<IntakeLogRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const years = useMemo(
    () => [...new Set(rows.map((r) => String(new Date(r.issued_date).getFullYear() + 543)))].sort((a, b) => Number(b) - Number(a)),
    [rows]
  );
  // Default to the latest year with data (or this year if there's none yet)
  // instead of showing "ทุกปี" — a 1,000+ row register is unusable to scroll
  // through unfiltered every time the page opens.
  const [yearFilter, setYearFilter] = useState(() => years[0] ?? String(new Date().getFullYear() + 543));

  const visibleRows = rows.filter(
    (r) => yearFilter === ALL_TAB || String(new Date(r.issued_date).getFullYear() + 543) === yearFilter
  );

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createIntakeLogEntry(categoryLabel, formData);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setCreateOpen(false);
      router.refresh();
    });
  }

  function handleUpdate(formData: FormData) {
    if (!editing) return;
    setError(null);
    startTransition(async () => {
      const res = await updateIntakeLogEntry(editing.id, formData);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteIntakeLogEntry(id);
      setConfirmId(null);
      setEditing(null);
      router.refresh();
    });
  }

  const columns: Column<IntakeLogRow>[] = [
    { key: "seq", label: "ลำดับที่", sortValue: (r) => r.seq, render: (r) => <span className="text-muted-foreground">{r.seq}</span> },
    {
      key: "doc_no",
      label: "เลขที่ลงรับ IRDP",
      sortValue: (r) => r.doc_no,
      render: (r) => <span className="whitespace-nowrap font-medium text-foreground">{r.doc_no}</span>,
    },
    { key: "ref_no", label: "ที่", sortValue: (r) => r.ref_no ?? "", render: (r) => <span className="whitespace-nowrap text-foreground">{r.ref_no ?? "-"}</span> },
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
    { key: "from_name", label: "จาก", sortValue: (r) => r.from_name ?? "", render: (r) => <span className="text-foreground">{r.from_name ?? "-"}</span> },
    { key: "recipient", label: "ถึง", sortValue: (r) => r.recipient ?? "", render: (r) => <span className="text-foreground">{r.recipient ?? "-"}</span> },
    { key: "title", label: "เรื่อง", sortValue: (r) => r.title, render: (r) => <span className="text-foreground">{r.title}</span>, className: "max-w-[320px]" },
    { key: "handler_name", label: "การปฏิบัติ", sortValue: (r) => r.handler_name, render: (r) => <span className="text-foreground">{r.handler_name}</span> },
    {
      key: "attachment",
      label: "ไฟล์แนบ",
      render: (r) =>
        r.attachment_url ? (
          <a href={r.attachment_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-primary hover:underline">
            <ExternalLink className="h-4 w-4" /> เปิดไฟล์
          </a>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: "actions",
      label: "จัดการ",
      render: (r) => (
        <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => setEditing(r)}>
          แก้ไข
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> เพิ่มรายการ
        </Button>
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value={ALL_TAB}>ทุกปี</option>
          {years.map((y) => (
            <option key={y} value={y}>
              ปี {y}
            </option>
          ))}
        </select>
      </div>

      {visibleRows.length === 0 ? (
        <EmptyState icon={FileText} title="ไม่พบรายการ" description="กดปุ่ม 'เพิ่มรายการ' เพื่อเริ่มลงรายการแรก" />
      ) : (
        <SortableTable columns={columns} rows={visibleRows} rowKey={(r) => r.id} defaultSort={{ key: "seq", dir: "desc" }} />
      )}

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setError(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>เพิ่มรายการ — {categoryLabel}</DialogTitle>
          </DialogHeader>
          <form action={handleCreate} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>ที่ (เลขอ้างอิงภายนอก)</Label>
                <Input name="refNo" placeholder="เช่น นร 1001/1" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>ลงวันที่ *</Label>
                <Input type="date" name="issuedDate" defaultValue={todayStr()} required />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>จาก</Label>
              <Input name="fromName" placeholder="หน่วยงาน/บุคคลที่ส่งมา" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>ถึง</Label>
              <Input name="recipient" placeholder="ผู้รับ" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>เรื่อง *</Label>
              <Input name="title" required autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>การปฏิบัติ (ผู้ดำเนินการ)</Label>
              <select name="handlerId" defaultValue="" className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— ตัวฉันเอง —</option>
                {employeeOptions.map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name}</option>
                ))}
              </select>
            </div>
            {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setError(null); setConfirmId(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.doc_no}</DialogTitle>
          </DialogHeader>
          {editing && (
            <form action={handleUpdate} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>ที่</Label>
                  <Input name="refNo" defaultValue={editing.ref_no ?? ""} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>ลงวันที่ *</Label>
                  <Input type="date" name="issuedDate" defaultValue={editing.issued_date} required />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>จาก</Label>
                <Input name="fromName" defaultValue={editing.from_name ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>ถึง</Label>
                <Input name="recipient" defaultValue={editing.recipient ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>เรื่อง *</Label>
                <Input name="title" defaultValue={editing.title} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>การปฏิบัติ (ผู้ดำเนินการ)</Label>
                <select name="handlerId" defaultValue={editing.handler_id} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                  {employeeOptions.map((e) => (
                    <option key={e.id} value={e.id}>{e.full_name}</option>
                  ))}
                </select>
              </div>
              {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
              <DialogFooter className="flex-row items-center justify-between sm:justify-between">
                {canDelete &&
                  (confirmId === editing.id ? (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">ลบรายการนี้?</span>
                      <button type="button" onClick={() => handleDelete(editing.id)} disabled={isPending} className="font-medium text-danger">
                        ยืนยัน
                      </button>
                      <button type="button" onClick={() => setConfirmId(null)} className="text-muted-foreground">
                        ยกเลิก
                      </button>
                    </div>
                  ) : (
                    <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs text-danger hover:text-danger" onClick={() => setConfirmId(editing.id)}>
                      <Trash2 className="h-3.5 w-3.5" /> ลบรายการนี้
                    </Button>
                  ))}
                <Button type="submit" disabled={isPending} className="ml-auto">
                  {isPending ? "กำลังบันทึก..." : "บันทึก"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
