"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, FileText, Hash, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shell/EmptyState";
import { SortableTable, type Column } from "@/components/shared/SortableTable";
import { createDocumentNumber, updateDocumentNumber, deleteDocumentNumber } from "@/app/(app)/document-numbers/actions";
import { compressImage } from "@/lib/image-compress";
import { ALL_BOOKS, bookOf, type Book } from "@/lib/document-number-books";

/** Server actions on this platform reject request bodies over a few MB — a raw
 * phone photo attachment can blow past that and the failure surfaces as a full
 * page reload instead of an in-app error, so compress before submitting. */
async function compressAttachment(formData: FormData) {
  const file = formData.get("attachment");
  if (file instanceof File && file.size > 0) {
    formData.set("attachment", await compressImage(file));
  }
}

export type DocNumberRow = {
  id: string;
  seq: number;
  doc_no: string;
  title: string;
  recipient: string | null;
  category_label: string | null;
  issued_date: string;
  department_name: string;
  issuer_name: string;
  attachment_url: string | null;
  remark: string | null;
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const ALL_TAB = "ทั้งหมด";

export function DocumentNumbersClient({
  rows,
  showDeptColumn,
  categoryLabels,
  recipientNames,
  canDelete,
  years,
  activeYear,
  activeBook,
  activeTab: activeTabFromUrl,
  search: searchFromUrl,
  showRemark,
}: {
  rows: DocNumberRow[];
  showDeptColumn: boolean;
  categoryLabels: string[];
  recipientNames: string[];
  canDelete: boolean;
  years: string[];
  activeYear: string;
  activeBook: string;
  activeTab: string;
  search: string;
  showRemark: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<DocNumberRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // Year, book, tab, and search are all real server-side filters
  // (?year=, ?book=, ?tab=, ?q=) — every row matching them loads in one shot
  // (no pagination), sorted newest-first by the page server component.
  // Switching any of them still re-navigates (a real refetch, slower than a
  // client-side filter would be), which is the known, accepted tradeoff —
  // it's what keeps every one of these filters simple and correct instead of
  // re-slicing whatever page of rows happened to already be on screen.
  const activeTab = activeTabFromUrl || ALL_TAB;
  const [search, setSearch] = useState(searchFromUrl);

  function buildUrl(overrides: { year?: string; book?: string; tab?: string; q?: string }) {
    const tab = overrides.tab ?? activeTab;
    const params = new URLSearchParams({
      year: overrides.year ?? activeYear,
      book: overrides.book ?? activeBook,
      tab: tab === ALL_TAB ? "" : tab,
      q: overrides.q ?? search,
    });
    return `/document-numbers?${params.toString()}`;
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      router.push(buildUrl({ q: value }));
    }, 400);
  }
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  function selectBook(book: Book) {
    router.push(buildUrl({ book, tab: ALL_TAB }));
  }

  function selectTab(tab: string) {
    router.push(buildUrl({ tab }));
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteDocumentNumber(id);
      setConfirmId(null);
      setEditing(null);
      router.refresh();
    });
  }

  const allLabels = [...categoryLabels, ...([...new Set(rows.map((r) => r.category_label).filter(Boolean))] as string[]).filter((l) => !categoryLabels.includes(l))];
  const tabs = [ALL_TAB, ...allLabels.filter((l) => bookOf(l) === activeBook)];

  // Tab is now a server-side filter too (see selectTab) — rows is already
  // scoped to it, no client-side re-filtering needed.
  const visibleRows = rows;

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      await compressAttachment(formData);
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
      await compressAttachment(formData);
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
    { key: "seq", label: "ลำดับที่", sortValue: (r) => r.seq, render: (r) => <span className="text-muted-foreground">{r.seq}</span> },
    {
      key: "doc_no",
      label: "เลขที่เอกสาร",
      // Sort by the running number itself, not the doc_no text — formats
      // differ across registers (and even across years in the same one), so
      // a plain string sort doesn't actually order rows newest-first.
      sortValue: (r) => r.seq,
      render: (r) => <span className="whitespace-nowrap font-medium text-foreground">{r.doc_no}</span>,
    },
    {
      key: "title",
      label: "ชื่อเรื่อง",
      sortValue: (r) => r.title,
      render: (r) => <span className="text-foreground">{r.title}</span>,
      className: "w-full min-w-[260px]",
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
    ...(showRemark
      ? ([
          {
            key: "remark",
            label: "หมายเหตุ",
            sortValue: (r: DocNumberRow) => r.remark ?? "",
            render: (r: DocNumberRow) => <span className="text-foreground">{r.remark ?? "-"}</span>,
          },
        ] as Column<DocNumberRow>[])
      : []),
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
      <div className="flex items-center justify-between gap-2">
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> ออกเลขเอกสาร
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {ALL_BOOKS.map((book) => (
          <button
            key={book}
            type="button"
            onClick={() => selectBook(book)}
            className={`flex-1 min-w-[45%] rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
              activeBook === book
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-surface"
            }`}
          >
            {book}
          </button>
        ))}
      </div>

      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => selectTab(tab)}
              className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.replace(/^งานบุคคล - /, "")}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={activeYear}
          onChange={(e) => router.push(buildUrl({ year: e.target.value }))}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              ปี {y}
            </option>
          ))}
        </select>
        <Input
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="ค้นหาชื่อเรื่อง, ถึง, เลขที่, ผู้ออกเลข... (ค้นทุกหน้า)"
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
        <SortableTable columns={columns} rows={visibleRows} rowKey={(r) => r.id} defaultSort={{ key: "doc_no", dir: "desc" }} />
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
            {showRemark && (
              <div className="flex flex-col gap-1.5">
                <Label>หมายเหตุ</Label>
                <Input name="remark" placeholder="เช่น ส่งตามสัญญา 1 เล่ม" />
              </div>
            )}
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
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setError(null); setConfirmId(null); } }}>
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
              {showRemark && (
                <div className="flex flex-col gap-1.5">
                  <Label>หมายเหตุ</Label>
                  <Input name="remark" defaultValue={editing.remark ?? ""} placeholder="เช่น ส่งตามสัญญา 1 เล่ม" />
                </div>
              )}
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-xs text-danger hover:text-danger"
                      onClick={() => setConfirmId(editing.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> ลบเอกสารนี้
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
