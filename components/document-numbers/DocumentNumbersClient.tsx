"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, FileText, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shell/EmptyState";
import { SortableTable, type Column } from "@/components/shared/SortableTable";
import { createDocumentNumber, updateDocumentNumber } from "@/app/(app)/document-numbers/actions";

export type DocNumberRow = {
  id: string;
  doc_no: string;
  title: string;
  issued_date: string;
  department_name: string;
  issuer_name: string;
  attachment_url: string | null;
};

const todayStr = () => new Date().toISOString().slice(0, 10);

export function DocumentNumbersClient({ rows, showDeptColumn }: { rows: DocNumberRow[]; showDeptColumn: boolean }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<DocNumberRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createDocumentNumber(formData);
      if ("error" in res) {
        setError(res.error ?? "เกิดข้อผิดพลาด");
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
      const res = await updateDocumentNumber(editing.id, formData);
      if ("error" in res) {
        setError(res.error ?? "เกิดข้อผิดพลาด");
        return;
      }
      setEditing(null);
      router.refresh();
    });
  }

  const columns: Column<DocNumberRow>[] = [
    {
      key: "doc_no",
      label: "เลขที่เอกสาร",
      sortValue: (r) => r.doc_no,
      render: (r) => <span className="whitespace-nowrap font-medium text-foreground">{r.doc_no}</span>,
    },
    {
      key: "title",
      label: "ชื่อเรื่อง",
      sortValue: (r) => r.title,
      render: (r) => <span className="text-foreground">{r.title}</span>,
      className: "max-w-[280px]",
    },
    {
      key: "issued_date",
      label: "วันที่ออกเลข",
      sortValue: (r) => r.issued_date,
      render: (r) => (
        <span className="whitespace-nowrap text-foreground">
          {new Date(r.issued_date).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}
        </span>
      ),
    },
    ...(showDeptColumn
      ? ([
          {
            key: "department_name",
            label: "ฝ่าย",
            sortValue: (r: DocNumberRow) => r.department_name,
            render: (r: DocNumberRow) => <span className="text-foreground">{r.department_name}</span>,
          },
        ] as Column<DocNumberRow>[])
      : []),
    {
      key: "issuer_name",
      label: "ผู้ออกเลข",
      sortValue: (r) => r.issuer_name,
      render: (r) => <span className="text-foreground">{r.issuer_name}</span>,
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
            <FileText className="h-4 w-4" /> เปิดไฟล์
          </a>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: "actions",
      label: "จัดการ",
      render: (r) => (
        <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setEditing(r)}>
          <Pencil className="h-3.5 w-3.5" /> แก้ไข
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Button type="button" className="self-start" onClick={() => setCreateOpen(true)}>
        <Plus className="h-4 w-4" /> ออกเลขเอกสาร
      </Button>

      {rows.length === 0 ? (
        <EmptyState icon={Hash} title="ยังไม่มีเอกสารที่ออกเลข" description="กดปุ่ม 'ออกเลขเอกสาร' เพื่อเริ่มออกเลขแรก" />
      ) : (
        <SortableTable columns={columns} rows={rows} rowKey={(r) => r.id} />
      )}

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setError(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ออกเลขเอกสาร</DialogTitle>
          </DialogHeader>
          <form action={handleCreate} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>ชื่อเรื่อง</Label>
              <Input name="title" placeholder="ออกเอกสารเรื่องอะไร..." required autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>วันที่ออกเลข</Label>
              <Input type="date" name="issuedDate" defaultValue={todayStr()} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>แนบไฟล์ (ถ้ามี)</Label>
              <Input type="file" name="attachment" />
            </div>
            {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "กำลังออกเลข..." : "ออกเลข"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setError(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.doc_no}</DialogTitle>
          </DialogHeader>
          {editing && (
            <form action={handleUpdate} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>ชื่อเรื่อง</Label>
                <Input name="title" defaultValue={editing.title} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>วันที่ออกเลข</Label>
                <Input type="date" name="issuedDate" defaultValue={editing.issued_date} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{editing.attachment_url ? "แทนที่ไฟล์แนบ" : "แนบไฟล์"}</Label>
                <Input type="file" name="attachment" />
                {editing.attachment_url && (
                  <a href={editing.attachment_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                    ไฟล์ปัจจุบัน — เปิดดู
                  </a>
                )}
              </div>
              {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
              <DialogFooter>
                <Button type="submit" disabled={isPending}>
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
