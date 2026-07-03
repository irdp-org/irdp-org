"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Receipt, Pencil, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shell/EmptyState";
import { LEAVE_STATUS_LABELS_TH } from "@/lib/leave";
import { TRAVEL_MODES, MODE_LABELS, KM_RATE, formatBaht } from "@/lib/travel";
import { saveClaim, deleteClaim, generateTravelDoc } from "@/app/(app)/travel-expense/actions";
import { GenerateDocButton } from "@/components/booking/GenerateDocButton";
import type { RequestStatusT } from "@/lib/database.types";

export type TravelItem = {
  id: string;
  claim_id: string;
  travel_date: string;
  from_location: string | null;
  to_location: string | null;
  mode: string;
  km: number | null;
  amount: number;
  note: string | null;
  sort_order: number;
};

export type TravelClaim = {
  id: string;
  title: string | null;
  status: RequestStatusT;
  total_amount: number;
  created_at: string;
  items: TravelItem[];
};

type Row = {
  travel_date: string;
  from_location: string;
  to_location: string;
  mode: string;
  km: string;
  amount: string;
  note: string;
};

const STATUS_VARIANT: Record<RequestStatusT, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  submitted: "secondary",
  approved: "default",
  rejected: "destructive",
  returned: "destructive",
  cancelled: "outline",
};

function emptyRow(): Row {
  return {
    travel_date: new Date().toISOString().slice(0, 10),
    from_location: "",
    to_location: "",
    mode: "bus",
    km: "",
    amount: "",
    note: "",
  };
}

function rowAmount(r: Row): number {
  if (r.mode === "private_car") {
    const km = Number(r.km);
    return Number.isFinite(km) ? Math.round(km * KM_RATE * 100) / 100 : 0;
  }
  const a = Number(r.amount);
  return Number.isFinite(a) ? a : 0;
}

export function TravelExpenseClient({ claims }: { claims: TravelClaim[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TravelClaim | null>(null);
  const [detail, setDetail] = useState<TravelClaim | null>(null);

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(c: TravelClaim) {
    setEditing(c);
    setDetail(null);
    setFormOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <Button className="self-start" onClick={openNew}>
        <Plus className="h-4 w-4" /> สร้างเอกสารเบิก
      </Button>

      {claims.length === 0 ? (
        <EmptyState icon={Receipt} title="ยังไม่มีเอกสารเบิกค่าเดินทาง" />
      ) : (
        <ul className="flex flex-col gap-2">
          {claims.map((c) => (
            <li key={c.id} className="rounded-xl border border-border bg-surface">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => setDetail(c)}
              >
                <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                  <span className="font-medium text-foreground">{c.title || "เอกสารเบิกค่าเดินทาง"}</span>
                  <span className="text-muted-foreground">
                    {c.items.length} รายการ · รวม {formatBaht(c.total_amount)} บาท
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={STATUS_VARIANT[c.status]}>{LEAVE_STATUS_LABELS_TH[c.status]}</Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.title || "เอกสารเบิกค่าเดินทาง"}</DialogTitle>
              </DialogHeader>
              <div className="flex items-center justify-between">
                <Badge variant={STATUS_VARIANT[detail.status]}>{LEAVE_STATUS_LABELS_TH[detail.status]}</Badge>
                <div className="flex items-center gap-1">
                  <GenerateDocButton id={detail.id} generate={generateTravelDoc} label="ออกใบรับรองแทนใบเสร็จ" />
                  {(detail.status === "draft" || detail.status === "returned") && (
                    <Button size="sm" variant="outline" onClick={() => openEdit(detail)}>
                      <Pencil className="h-3.5 w-3.5" /> แก้ไข
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex flex-col divide-y divide-border">
                {detail.items.map((it) => (
                  <div key={it.id} className="flex flex-col gap-0.5 py-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium text-foreground">{format(new Date(it.travel_date), "d MMM yyyy")}</span>
                      <span className="font-medium text-foreground">{formatBaht(it.amount)} บาท</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {[it.from_location, it.to_location].filter(Boolean).join(" → ")}
                      {" · "}{MODE_LABELS[it.mode] ?? it.mode}
                      {it.mode === "private_car" && it.km ? ` (${it.km} กม.)` : ""}
                    </span>
                    {it.note && <span className="text-xs text-muted-foreground">{it.note}</span>}
                  </div>
                ))}
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
                <span>รวมทั้งสิ้น</span>
                <span>{formatBaht(detail.total_amount)} บาท</span>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {formOpen && (
        <ClaimForm
          existing={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ClaimForm({
  existing,
  onClose,
  onSaved,
}: {
  existing: TravelClaim | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [rows, setRows] = useState<Row[]>(
    existing && existing.items.length
      ? existing.items.map((it) => ({
          travel_date: it.travel_date,
          from_location: it.from_location ?? "",
          to_location: it.to_location ?? "",
          mode: it.mode,
          km: it.km != null ? String(it.km) : "",
          amount: it.mode === "private_car" ? "" : String(it.amount),
          note: it.note ?? "",
        }))
      : [emptyRow()]
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const total = rows.reduce((s, r) => s + rowAmount(r), 0);

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }
  function removeRow(i: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  function submit(doSubmit: boolean) {
    setError(null);
    const fd = new FormData();
    if (existing) fd.set("id", existing.id);
    fd.set("title", title);
    fd.set("submit", String(doSubmit));
    fd.set(
      "items",
      JSON.stringify(
        rows.map((r) => ({
          travel_date: r.travel_date,
          from_location: r.from_location,
          to_location: r.to_location,
          mode: r.mode,
          km: r.mode === "private_car" ? r.km : null,
          amount: rowAmount(r),
          note: r.note,
        }))
      )
    );
    startTransition(async () => {
      const res = await saveClaim(fd);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "แก้ไขเอกสารเบิก" : "สร้างเอกสารเบิกค่าเดินทาง"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>ชื่อ/วัตถุประสงค์ (ไม่บังคับ)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น เดินทางประชุมนอกสถานที่" />
          </div>

          {rows.map((r, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">รายการที่ {i + 1}</span>
                {rows.length > 1 && (
                  <button type="button" onClick={() => removeRow(i)} className="text-danger">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Input type="date" value={r.travel_date} onChange={(e) => updateRow(i, { travel_date: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="จาก" value={r.from_location} onChange={(e) => updateRow(i, { from_location: e.target.value })} />
                <Input placeholder="ถึง" value={r.to_location} onChange={(e) => updateRow(i, { to_location: e.target.value })} />
              </div>
              <select
                value={r.mode}
                onChange={(e) => updateRow(i, { mode: e.target.value })}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {TRAVEL_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              {r.mode === "private_car" ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="ระยะทาง (กม.)"
                    value={r.km}
                    onChange={(e) => updateRow(i, { km: e.target.value })}
                  />
                  <span className="whitespace-nowrap text-sm text-muted-foreground">= {formatBaht(rowAmount(r))} บาท</span>
                </div>
              ) : (
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="จำนวนเงิน (บาท)"
                  value={r.amount}
                  onChange={(e) => updateRow(i, { amount: e.target.value })}
                />
              )}
              <Input placeholder="หมายเหตุ (ไม่บังคับ)" value={r.note} onChange={(e) => updateRow(i, { note: e.target.value })} />
            </div>
          ))}

          <Button type="button" variant="outline" onClick={addRow} className="self-start">
            <Plus className="h-4 w-4" /> เพิ่มรายการ
          </Button>

          <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
            <span>รวมทั้งสิ้น</span>
            <span>{formatBaht(total)} บาท</span>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" disabled={isPending} onClick={() => submit(false)}>
              บันทึกร่าง
            </Button>
            <Button type="button" className="flex-1" disabled={isPending} onClick={() => submit(true)}>
              {isPending ? "กำลังบันทึก..." : "ส่งอนุมัติ"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
