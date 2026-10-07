"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { Plus, PackageMinus, PackagePlus, History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shell/EmptyState";
import { SortableTable, type Column } from "@/components/shared/SortableTable";
import { createStockItem, adjustStock, deleteStockItem } from "@/app/(app)/stock/actions";

export type StockTxRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  delta: number;
  remaining_after: number;
  note: string | null;
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
  const [adjustTarget, setAdjustTarget] = useState<{ item: StockItemRow; mode: "in" | "out" } | null>(null);
  const [historyTarget, setHistoryTarget] = useState<StockItemRow | null>(null);
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
        Number(formData.get("qty") ?? 0)
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
    const note = String(formData.get("note") ?? "");
    const delta = adjustTarget.mode === "out" ? -Math.abs(qty) : Math.abs(qty);
    startTransition(async () => {
      const res = await adjustStock(adjustTarget.item.id, delta, note);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setAdjustTarget(null);
      router.refresh();
    });
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
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={() => setAdjustTarget({ item: i, mode: "out" })}>
            <PackageMinus className="h-3.5 w-3.5" /> ตัดสต๊อค
          </Button>
          <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setAdjustTarget({ item: i, mode: "in" })}>
            <PackagePlus className="h-3.5 w-3.5" /> นำเข้าเพิ่ม
          </Button>
          <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setHistoryTarget(i)}>
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

  return (
    <div className="flex flex-col gap-4">
      <Button type="button" className="self-start" onClick={() => setCreateOpen(true)}>
        <Plus className="h-4 w-4" /> เพิ่มของเข้าสต๊อค
      </Button>

      {items.length === 0 ? (
        <EmptyState icon={PackagePlus} title="ยังไม่มีรายการสต๊อค" description="กด 'เพิ่มของเข้าสต๊อค' เพื่อเริ่มต้น" />
      ) : (
        <SortableTable columns={columns} rows={items} rowKey={(i) => i.id} />
      )}

      {/* Create item */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setError(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>เพิ่มของเข้าสต๊อค</DialogTitle></DialogHeader>
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
            {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={isPending}>{isPending ? "กำลังบันทึก..." : "บันทึก"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Adjust (deduct / restock) */}
      <Dialog open={!!adjustTarget} onOpenChange={(o) => { if (!o) { setAdjustTarget(null); setError(null); } }}>
        <DialogContent className="sm:max-w-sm">
          {adjustTarget && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {adjustTarget.mode === "out" ? "ตัดสต๊อค" : "นำเข้าเพิ่ม"}: {adjustTarget.item.name}
                </DialogTitle>
              </DialogHeader>
              <form action={handleAdjust} className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  คงเหลือปัจจุบัน {adjustTarget.item.quantity_on_hand.toLocaleString()} {adjustTarget.item.unit ?? ""} — ผู้ทำรายการ: {currentEmployeeName}
                </p>
                <div className="flex flex-col gap-1.5">
                  <Label>จำนวน{adjustTarget.mode === "out" ? "ที่จะตัดออก" : "ที่นำเข้าเพิ่ม"}</Label>
                  <Input type="number" name="qty" min={1} required autoFocus />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>หมายเหตุ (ไม่บังคับ)</Label>
                  <Input name="note" placeholder="เช่น ใช้ในงานอบรมรุ่นที่ 5" />
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
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          {historyTarget && (
            <>
              <DialogHeader><DialogTitle>ประวัติ: {historyTarget.name}</DialogTitle></DialogHeader>
              {historyTarget.transactions.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีการเคลื่อนไหว</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {historyTarget.transactions.map((t) => (
                    <li key={t.id} className="flex flex-col gap-0.5 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">
                          {t.delta > 0 ? "+" : ""}{t.delta.toLocaleString()} {historyTarget.unit ?? ""}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(t.created_at), "d MMM yyyy HH:mm", { locale: th })}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        โดย {t.employee_name} · เหลือ {t.remaining_after.toLocaleString()} {historyTarget.unit ?? ""}
                        {t.note ? ` · ${t.note}` : ""}
                      </span>
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
