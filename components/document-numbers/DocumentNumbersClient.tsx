"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, FileText, Hash, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shell/EmptyState";
import { SortableTable, type Column } from "@/components/shared/SortableTable";
import { createDocumentNumber, updateDocumentNumber, deleteDocumentNumber } from "@/app/(app)/document-numbers/actions";

export type DocNumberRow = {
  id: string;
  doc_no: string;
  title: string;
  recipient: string | null;
  category_label: string | null;
  issued_date: string;
  department_name: string;
  issuer_name: string;
  attachment_url: string | null;
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const ALL_TAB = "ทั้งหมด";

export function DocumentNumbersClient({
  rows,
  showDeptColumn,
  categoryLabels,
  recipientNames,
  canDelete,
}: {
  rows: DocNumberRow[];
  showDeptColumn: boolean;
  categoryLabels: string[];
  recipientNames: string[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<DocNumberRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState(ALL_TAB);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState(ALL_TAB);
  const [search, setSearch] = useState("");

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteDocumentNumber(id);
      setConfirmId(null);
      router.refresh();
    });
  }

  const tabs = [ALL_TAB, ...categoryLabels, ...([...new Set(rows.map((r) => r.category_label).filter(Boolean))] as string[]).filter((l) => !categoryLabels.includes(l))];

  const years = [...new Set(rows.map((r) => String(new Date(r.issued_date).getFullYear() + 543)))].sort((a, b) => Number(b) - Number(a));

  const searchLower = search.trim().toLowerCase();
  const visibleRows = rows
    .filter((r) => activeTab === ALL_TAB || r.category_label === activeTab)
    .filter((r) => yearFilter === ALL_TAB || String(new Date(r.issued_date).getFullYear() + 543) === yearFilter)
    .filter(
      (r) =>
        !searchLower ||
        r.title.toLowerCase().includes(searchLower) ||
        (r.recipient ?? "").toLowerCase().includes(searchLower) ||
        r.doc_no.toLowerCase().includes(searchLower) ||
        r.issuer_name.toLowerCase().includes(searchLower)
    );

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
      key: "recipient",
      label: "ถึง",
      sortValue: (r) => r.recipient ?? "",
      render: (r) => <span className="text-foreground">{r.recipient ?? "-"}</span>,
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
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setEditing(r)}>
            <Pencil className="h-3.5 w-3.5" /> แก้ไข
          </Button>
          {canDelete &&
            (confirmId === r.id ? (
              <>
                <button
                  type="button"
                  onClick={() => handleDelete(r.id)}
                  disabled={isPending}
                  className="text-xs text-danger"
                >
                  ยืนยัน
                </button>
                <button type="button" onClick={() => setConfirmId(null)} className="text-xs text-muted-foreground">
                  ยกเลิก
                </button>
              </>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-xs text-danger hover:text-danger"
                onClick={() => setConfirmId(r.id)}
              >
                <Trash2 className="h-3.5 w-3.5" /> ลบ
              </Button>
            ))}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> ออกเลขเอกสาร
        </Button>
      </div>

      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อเรื่อง, ถึง, เลขที่, ผู้ออกเลข..."
          className="sm:max-w-xs"
        />
      </div>

      {visibleRows.length === 0 ? (
        rows.length === 0 ? (
          <EmptyState icon={Hash} title="ยังไม่มีเอกสารที่ออกเลข" description="กดปุ่ม 'ออกเลขเอกสาร' เพื่อเริ่มออกเลขแรก" />
        ) : (
          <EmptyState icon={Hash} title="ไม่พบรายการ" description="ลองเปลี่ยนตัวกรองหรือคำค้นหา" />
        )
      ) : (
        <SortableTable columns={columns} rows={visibleRows} rowKey={(r) => r.id} />
      )}

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setError(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ออกเลขเอกสาร</DialogTitle>
          </DialogHeader>
          <form action={handleCreate} className="flex flex-col gap-3">
            {categoryLabels.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>หมวด/ส่วนงาน</Label>
                <Input
                  name="category"
                  list="doc-category-options"
                  placeholder="เช่น IT, บช., บค. (พิมพ์ใหม่เพื่อสร้างหมวด)"
                  defaultValue={activeTab !== ALL_TAB ? activeTab : ""}
                />
                <datalist id="doc-category-options">
                  {categoryLabels.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>ชื่อเรื่อง</Label>
              <Input name="title" placeholder="ออกเอกสารเรื่องอะไร..." required autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>ถึง</Label>
              <Input name="recipient" list="doc-recipient-options" placeholder="ชื่อบริษัท/บุคคล/ตำแหน่ง (พิมพ์ใหม่เพื่อเพิ่ม)" />
              <datalist id="doc-recipient-options">
                {recipientNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
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
                <Label>ถึง</Label>
                <Input name="recipient" list="doc-recipient-options" defaultValue={editing.recipient ?? ""} placeholder="ชื่อบริษัท/บุคคล/ตำแหน่ง" />
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
