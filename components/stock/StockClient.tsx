"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { Plus, PackageMinus, PackagePlus, Undo2, History, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shell/EmptyState";
import { SortableTable, type Column } from "@/components/shared/SortableTable";
import { createStockItem, purchaseStock, deductStock, returnStock, deleteStockItem } from "@/app/(app)/stock/actions";
import type { StockTxKindT } from "@/lib/database.types";

export type StockTxRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  delta: number;
  remaining_after: number;
  note: string | null;
  kind: StockTxKindT;
  total_price: number | null;
  vendor: string | null;
  purchase_date: string | null;
  project: string | null;
  created_at: string;
};

export type StockItemRow = {
  id: string;
  name: string;
  unit: string | null;
  quantity_on_hand: number;
  created_at: string;
  transactions: StockTxRow[];
};

const KIND_LABEL: Record<StockTxKindT, string> = {
  purchase: "นำเข้า",
  deduct: "ตัดสต๊อค",
  return: "คืนสต๊อค",
  adjust: "ปรับยอด",
};
const KIND_BADGE: Record<StockTxKindT, string> = {
  purchase: "bg-primary/10 text-primary",
  deduct: "bg-danger/10 text-danger",
  return: "bg-success/10 text-success",
  adjust: "bg-muted text-muted-foreground",
};

type AdjustMode = "in" | "out" | "return";

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function StockClient({
  items,
  currentEmployeeName,
  canDelete = false,
}: {
  items: StockItemRow[];
  currentEmployeeName: string;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<{ item: StockItemRow; mode: AdjustMode } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<StockItemRow | null>(null);
  const [historyMode, setHistoryMode] = useState<"all" | "month" | "year">("all");
  const [historyMonth, setHistoryMonth] = useState(format(new Date(), "yyyy-MM"));
  const [historyYear, setHistoryYear] = useState(String(new Date().getFullYear()));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete(itemId: string) {
    startTransition(async () => {
      await deleteStockItem(itemId);
      setConfirmDeleteId(null);
      router.refresh();
    });
  }

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createStockItem(
        String(formData.get("name") ?? ""),
        String(formData.get("unit") ?? ""),
        Number(formData.get("qty") ?? 0),
        formData.get("totalPrice") ? Number(formData.get("totalPrice")) : null,
        String(formData.get("vendor") ?? ""),
        String(formData.get("purchaseDate") ?? ""),
        String(formData.get("note") ?? "")
      );
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setCreateOpen(false);
      router.refresh();
    });
  }

  function handleAdjust(formData: FormData) {
    if (!adjustTarget) return;
    setError(null);
    const qty = Number(formData.get("qty") ?? 0);
    startTransition(async () => {
      let res;
      if (adjustTarget.mode === "in") {
        res = await purchaseStock(
          adjustTarget.item.id,
          qty,
          formData.get("totalPrice") ? Number(formData.get("totalPrice")) : null,
          String(formData.get("vendor") ?? ""),
          String(formData.get("purchaseDate") ?? ""),
          String(formData.get("note") ?? "")
        );
      } else if (adjustTarget.mode === "out") {
        res = await deductStock(adjustTarget.item.id, qty, String(formData.get("project") ?? ""), String(formData.get("note") ?? ""));
      } else {
        res = await returnStock(adjustTarget.item.id, qty, String(formData.get("project") ?? ""), String(formData.get("note") ?? ""));
      }
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setAdjustTarget(null);
      router.refresh();
    });
  }

  const filteredHistory = useMemo(() => {
    if (!historyTarget) return [];
    return historyTarget.transactions.filter((t) => {
      if (historyMode === "month") return t.created_at.slice(0, 7) === historyMonth;
      if (historyMode === "year") return t.created_at.slice(0, 4) === historyYear;
      return true;
    });
  }, [historyTarget, historyMode, historyMonth, historyYear]);

  const historyYears = useMemo(() => {
    if (!historyTarget) return [];
    return [...new Set(historyTarget.transactions.map((t) => t.created_at.slice(0, 4)))].sort((a, b) => Number(b) - Number(a));
  }, [historyTarget]);

  function exportAllCsv() {
    const rows: string[][] = [
      ["วันที่", "ชื่อของ", "ประเภทรายการ", "จำนวน", "คงเหลือหลังทำรายการ", "ราคารวม VAT", "ร้านค้า", "วันที่ซื้อ", "โครงการ/หลักสูตร", "ผู้ทำรายการ", "หมายเหตุ"],
    ];
    for (const item of items) {
      for (const t of item.transactions) {
        rows.push([
          format(new Date(t.created_at), "yyyy-MM-dd HH:mm"),
          item.name,
          KIND_LABEL[t.kind],
          String(t.delta),
          String(t.remaining_after),
          t.total_price != null ? String(t.total_price) : "",
          t.vendor ?? "",
          t.purchase_date ?? "",
          t.project ?? "",
          t.employee_name,
          t.note ?? "",
        ]);
      }
    }
    downloadCsv(`stock-report-${format(new Date(), "yyyyMMdd")}.csv`, rows);
  }

  function exportHistoryCsv() {
    if (!historyTarget) return;
    const rows: string[][] = [
      ["วันที่", "ประเภทรายการ", "จำนวน", "คงเหลือหลังทำรายการ", "ราคารวม VAT", "ร้านค้า", "วันที่ซื้อ", "โครงการ/หลักสูตร", "ผู้ทำรายการ", "หมายเหตุ"],
    ];
    for (const t of filteredHistory) {
      rows.push([
        format(new Date(t.created_at), "yyyy-MM-dd HH:mm"),
        KIND_LABEL[t.kind],
        String(t.delta),
        String(t.remaining_after),
        t.total_price != null ? String(t.total_price) : "",
        t.vendor ?? "",
        t.purchase_date ?? "",
        t.project ?? "",
        t.employee_name,
        t.note ?? "",
      ]);
    }
    downloadCsv(`${historyTarget.name}-${format(new Date(), "yyyyMMdd")}.csv`, rows);
  }

  const columns: Column<StockItemRow>[] = [
    {
      key: "name",
      label: "ชื่อของ",
      sortValue: (i) => i.name,
      render: (i) => <span className="font-medium text-foreground">{i.name}</span>,
    },
    {
      key: "quantity_on_hand",
      label: "คงเหลือ",
      sortValue: (i) => i.quantity_on_hand,
      render: (i) => (
        <span className="whitespace-nowrap text-foreground">
          {i.quantity_on_hand.toLocaleString()} {i.unit ?? ""}
        </span>
      ),
    },
    {
      key: "actions",
      label: "จัดการ",
      render: (i) => (
        <div className="flex flex-wrap items-center gap-1">
          <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setAdjustTarget({ item: i, mode: "in" })}>
            <PackagePlus className="h-3.5 w-3.5" /> นำเข้า
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setAdjustTarget({ item: i, mode: "out" })}>
            <PackageMinus className="h-3.5 w-3.5" /> ตัดสต๊อค
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setAdjustTarget({ item: i, mode: "return" })}>
            <Undo2 className="h-3.5 w-3.5" /> คืนสต๊อค
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => {
              setHistoryTarget(i);
              setHistoryMode("all");
            }}
          >
            <History className="h-3.5 w-3.5" /> ประวัติ
          </Button>
          {canDelete &&
            (confirmDeleteId === i.id ? (
              <span className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">ลบ?</span>
                <button type="button" onClick={() => handleDelete(i.id)} disabled={isPending} className="font-medium text-danger">
                  ยืนยัน
                </button>
                <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-muted-foreground">
                  ยกเลิก
                </button>
              </span>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-xs text-danger hover:text-danger"
                onClick={() => setConfirmDeleteId(i.id)}
              >
                <Trash2 className="h-3.5 w-3.5" /> ลบ
              </Button>
            ))}
        </div>
      ),
    },
  ];

  const adjustTitle = adjustTarget
    ? adjustTarget.mode === "in"
      ? "นำเข้าสต๊อค"
      : adjustTarget.mode === "out"
        ? "ตัดสต๊อค"
        : "คืนสต๊อค"
    : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> เพิ่มรายการใหม่
        </Button>
        {items.some((i) => i.transactions.length > 0) && (
          <Button type="button" variant="outline" className="gap-1" onClick={exportAllCsv}>
            <Download className="h-4 w-4" /> ดาวน์โหลดรายงาน CSV
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={PackagePlus} title="ยังไม่มีรายการสต๊อค" description="กด 'เพิ่มรายการใหม่' เพื่อเริ่มต้น" />
      ) : (
        <SortableTable columns={columns} rows={items} rowKey={(i) => i.id} />
      )}

      {/* Create item */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setError(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader><DialogTitle>เพิ่มรายการใหม่ (นำเข้า)</DialogTitle></DialogHeader>
          <form action={handleCreate} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>ชื่อของ</Label>
              <Input name="name" placeholder="เช่น กระดาษ A4, ปากกา" required autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label>จำนวนที่นำเข้า</Label>
                <Input type="number" name="qty" min={0} defaultValue={0} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>หน่วย (ไม่บังคับ)</Label>
                <Input name="unit" placeholder="เช่น ชิ้น, รีม, กล่อง" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label>ราคารวม VAT (บาท)</Label>
                <Input type="number" name="totalPrice" min={0} step="0.01" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>ซื้อมาเมื่อไหร่</Label>
                <Input type="date" name="purchaseDate" defaultValue={format(new Date(), "yyyy-MM-dd")} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>ร้านค้าที่ซื้อมา</Label>
              <Input name="vendor" placeholder="เช่น ร้าน ABC" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>หมายเหตุ (ไม่บังคับ)</Label>
              <Input name="note" />
            </div>
            {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={isPending}>{isPending ? "กำลังบันทึก..." : "บันทึก"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Adjust: purchase / deduct / return */}
      <Dialog open={!!adjustTarget} onOpenChange={(o) => { if (!o) { setAdjustTarget(null); setError(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-sm">
          {adjustTarget && (
            <>
              <DialogHeader>
                <DialogTitle>{adjustTitle}: {adjustTarget.item.name}</DialogTitle>
              </DialogHeader>
              <form action={handleAdjust} className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  คงเหลือปัจจุบัน {adjustTarget.item.quantity_on_hand.toLocaleString()} {adjustTarget.item.unit ?? ""} — ผู้ทำรายการ: {currentEmployeeName}
                </p>
                <div className="flex flex-col gap-1.5">
                  <Label>จำนวน{adjustTarget.mode === "out" ? "ที่จะตัดออก" : adjustTarget.mode === "return" ? "ที่จะคืน" : "ที่นำเข้า"}</Label>
                  <Input type="number" name="qty" min={1} required autoFocus />
                </div>

                {adjustTarget.mode === "in" && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1.5">
                        <Label>ราคารวม VAT (บาท)</Label>
                        <Input type="number" name="totalPrice" min={0} step="0.01" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>ซื้อมาเมื่อไหร่</Label>
                        <Input type="date" name="purchaseDate" defaultValue={format(new Date(), "yyyy-MM-dd")} />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>ร้านค้าที่ซื้อมา</Label>
                      <Input name="vendor" placeholder="เช่น ร้าน ABC" />
                    </div>
                  </>
                )}

                {(adjustTarget.mode === "out" || adjustTarget.mode === "return") && (
                  <div className="flex flex-col gap-1.5">
                    <Label>{adjustTarget.mode === "out" ? "เบิกไปใช้ในโครงการ/หลักสูตรไหน" : "คืนจากโครงการ/หลักสูตรไหน"}</Label>
                    <Input name="project" placeholder="เช่น In-house กกท รุ่น C8" />
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label>หมายเหตุ (ไม่บังคับ)</Label>
                  <Input name="note" placeholder="รายละเอียดเพิ่มเติม" />
                </div>
                {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
                <DialogFooter>
                  <Button type="submit" disabled={isPending}>{isPending ? "กำลังบันทึก..." : "ยืนยัน"}</Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* History */}
      <Dialog open={!!historyTarget} onOpenChange={(o) => !o && setHistoryTarget(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {historyTarget && (
            <>
              <DialogHeader><DialogTitle>ประวัติ: {historyTarget.name}</DialogTitle></DialogHeader>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={historyMode}
                  onChange={(e) => setHistoryMode(e.target.value as "all" | "month" | "year")}
                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="month">รายเดือน</option>
                  <option value="year">รายปี</option>
                </select>
                {historyMode === "month" && (
                  <input
                    type="month"
                    value={historyMonth}
                    onChange={(e) => setHistoryMonth(e.target.value)}
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  />
                )}
                {historyMode === "year" && (
                  <select
                    value={historyYear}
                    onChange={(e) => setHistoryYear(e.target.value)}
                    className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                  >
                    {historyYears.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                )}
                {filteredHistory.length > 0 && (
                  <Button type="button" variant="outline" size="sm" className="ml-auto gap-1" onClick={exportHistoryCsv}>
                    <Download className="h-3.5 w-3.5" /> CSV
                  </Button>
                )}
              </div>

              {filteredHistory.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีการเคลื่อนไหวในช่วงที่เลือก</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {filteredHistory.map((t) => (
                    <li key={t.id} className="flex flex-col gap-0.5 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND_BADGE[t.kind]}`}>{KIND_LABEL[t.kind]}</span>
                          <span className="font-medium text-foreground">
                            {t.delta > 0 ? "+" : ""}{t.delta.toLocaleString()} {historyTarget.unit ?? ""}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(t.created_at), "d MMM yyyy HH:mm", { locale: th })}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        โดย {t.employee_name} · เหลือ {t.remaining_after.toLocaleString()} {historyTarget.unit ?? ""}
                      </span>
                      {(t.vendor || t.total_price != null || t.purchase_date) && (
                        <span className="text-xs text-muted-foreground">
                          {[
                            t.vendor ? `ร้าน: ${t.vendor}` : null,
                            t.total_price != null ? `ราคารวม VAT: ${t.total_price.toLocaleString()} บาท` : null,
                            t.purchase_date ? `วันที่ซื้อ: ${t.purchase_date}` : null,
                          ].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      {t.project && <span className="text-xs text-primary">โครงการ/หลักสูตร: {t.project}</span>}
                      {t.note && <span className="text-xs text-muted-foreground">{t.note}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
