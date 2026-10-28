"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Receipt, Pencil, ExternalLink, ArrowLeftRight, Route, Save } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shell/EmptyState";
import { SortableTable, type Column } from "@/components/shared/SortableTable";
import { LEAVE_STATUS_LABELS_TH } from "@/lib/leave";
import { TRAVEL_MODES, MODE_LABELS, KM_RATE, formatBaht } from "@/lib/travel";
import {
  saveClaim,
  deleteClaim,
  generateTravelDoc,
  saveTripTemplate,
  deleteTripTemplate,
  type TripTemplate,
} from "@/app/(app)/travel-expense/actions";
import { GenerateDocButton } from "@/components/booking/GenerateDocButton";
import { compressImage } from "@/lib/image-compress";
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
  attachment_urls: string[];
  generated_doc_url?: string | null;
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

// Native <input list=datalist> suggestions don't show up on mobile Safari
// (iOS effectively ignores datalist) — IRDP is 100% mobile usage, so a
// custom dropdown is needed instead of relying on the browser's datalist.
function LocationAutocomplete({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const filtered = options.filter((o) => o.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 8);

  return (
    <div className="relative">
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-border bg-background shadow-md">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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

const ALL_FILTER = "ทั้งหมด";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold text-foreground">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

export function TravelExpenseClient({
  claims,
  savedLocations,
  tripTemplates,
  canManage = false,
}: {
  claims: TravelClaim[];
  savedLocations: string[];
  tripTemplates: TripTemplate[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TravelClaim | null>(null);
  const [detail, setDetail] = useState<TravelClaim | null>(null);
  const [statusFilter, setStatusFilter] = useState(ALL_FILTER);
  const [yearFilter, setYearFilter] = useState(ALL_FILTER);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeletePending, startDeleteTransition] = useTransition();

  function handleDelete(id: string) {
    startDeleteTransition(async () => {
      await deleteClaim(id);
      setConfirmDeleteId(null);
      setDetail(null);
      router.refresh();
    });
  }

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(c: TravelClaim) {
    setEditing(c);
    setDetail(null);
    setFormOpen(true);
  }

  const approvedTotal = claims.filter((c) => c.status === "approved").reduce((s, c) => s + c.total_amount, 0);
  const pendingClaims = claims.filter((c) => c.status === "submitted");
  const pendingTotal = pendingClaims.reduce((s, c) => s + c.total_amount, 0);

  const years = [...new Set(claims.map((c) => String(new Date(c.created_at).getFullYear() + 543)))].sort((a, b) => Number(b) - Number(a));
  const visibleClaims = claims
    .filter((c) => statusFilter === ALL_FILTER || c.status === statusFilter)
    .filter((c) => yearFilter === ALL_FILTER || String(new Date(c.created_at).getFullYear() + 543) === yearFilter);

  const columns: Column<TravelClaim>[] = [
    {
      key: "title",
      label: "ชื่อเรื่อง",
      sortValue: (c) => c.title ?? "",
      render: (c) => <span className="font-medium text-foreground">{c.title || "เอกสารเบิกค่าเดินทาง"}</span>,
    },
    {
      key: "items",
      label: "รายการ",
      sortValue: (c) => c.items.length,
      render: (c) => <span className="text-foreground">{c.items.length} รายการ</span>,
    },
    {
      key: "total_amount",
      label: "จำนวนเงิน",
      sortValue: (c) => c.total_amount,
      render: (c) => <span className="whitespace-nowrap text-foreground">{formatBaht(c.total_amount)} บาท</span>,
    },
    {
      key: "status",
      label: "สถานะ",
      sortValue: (c) => c.status,
      render: (c) => <Badge variant={STATUS_VARIANT[c.status]}>{LEAVE_STATUS_LABELS_TH[c.status]}</Badge>,
    },
    {
      key: "created_at",
      label: "วันที่สร้าง",
      sortValue: (c) => c.created_at,
      render: (c) => <span className="whitespace-nowrap text-foreground">{format(new Date(c.created_at), "d MMM yyyy")}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatCard label="เอกสารทั้งหมด" value={String(claims.length)} />
        <StatCard label="อนุมัติแล้ว" value={`${formatBaht(approvedTotal)} บาท`} sub={`${claims.filter((c) => c.status === "approved").length} ฉบับ`} />
        <StatCard label="รออนุมัติ" value={`${formatBaht(pendingTotal)} บาท`} sub={`${pendingClaims.length} ฉบับ`} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> สร้างเอกสารเบิก
        </Button>
        <div className="flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value={ALL_FILTER}>ทุกสถานะ</option>
            {(Object.keys(LEAVE_STATUS_LABELS_TH) as RequestStatusT[]).map((s) => (
              <option key={s} value={s}>
                {LEAVE_STATUS_LABELS_TH[s]}
              </option>
            ))}
          </select>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value={ALL_FILTER}>ทุกปี</option>
            {years.map((y) => (
              <option key={y} value={y}>
                ปี {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visibleClaims.length === 0 ? (
        claims.length === 0 ? (
          <EmptyState icon={Receipt} title="ยังไม่มีเอกสารเบิกค่าเดินทาง" />
        ) : (
          <EmptyState icon={Receipt} title="ไม่พบรายการ" description="ลองเปลี่ยนตัวกรอง" />
        )
      ) : (
        <SortableTable columns={columns} rows={visibleClaims} rowKey={(c) => c.id} onRowClick={setDetail} />
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
                  {detail.generated_doc_url && (
                    <a
                      href={detail.generated_doc_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> เปิดเอกสารที่สร้างไว้
                    </a>
                  )}
                  <GenerateDocButton
                    id={detail.id}
                    generate={generateTravelDoc}
                    label="ออกใบรับรองแทนใบเสร็จ"
                    onGenerated={(url) => setDetail((d) => (d ? { ...d, generated_doc_url: url } : d))}
                  />
                  {(detail.status === "draft" || detail.status === "returned" || canManage) && (
                    <Button size="sm" variant="outline" onClick={() => openEdit(detail)}>
                      <Pencil className="h-3.5 w-3.5" /> แก้ไข
                    </Button>
                  )}
                  {(canManage || detail.status === "draft") &&
                    (confirmDeleteId === detail.id ? (
                      <>
                        <Button size="sm" variant="destructive" disabled={isDeletePending} onClick={() => handleDelete(detail.id)}>
                          ยืนยันลบ
                        </Button>
                        <Button size="sm" variant="ghost" disabled={isDeletePending} onClick={() => setConfirmDeleteId(null)}>
                          ยกเลิก
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirmDeleteId(detail.id)}>
                        <Trash2 className="h-3.5 w-3.5" /> ลบ
                      </Button>
                    ))}
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
              {detail.attachment_urls.length > 0 && (
                <div className="flex flex-col gap-1.5 border-t border-border pt-2">
                  <span className="text-xs text-muted-foreground">หลักฐานแนบ ({detail.attachment_urls.length})</span>
                  <div className="grid grid-cols-3 gap-2">
                    {detail.attachment_urls.map((u, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={i} href={u} target="_blank" rel="noopener noreferrer">
                        <img src={u} alt={`หลักฐาน ${i + 1}`} className="aspect-square w-full rounded-lg border border-border object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {formOpen && (
        <ClaimForm
          existing={editing}
          savedLocations={savedLocations}
          tripTemplates={tripTemplates}
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
  savedLocations,
  tripTemplates,
  onClose,
  onSaved,
}: {
  existing: TravelClaim | null;
  savedLocations: string[];
  tripTemplates: TripTemplate[];
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
  const [files, setFiles] = useState<File[]>([]);
  const [isPending, startTransition] = useTransition();
  const [templates, setTemplates] = useState(tripTemplates);
  const [savingTemplateName, setSavingTemplateName] = useState<string | null>(null);
  const [templatePending, startTemplateTransition] = useTransition();

  const total = rows.reduce((s, r) => s + rowAmount(r), 0);

  // Apply a saved "เส้นทางที่ใช้บ่อย": append its whole bundle (e.g.
  // ขาไป + ค่าทางด่วนขาไป + ขากลับ + ค่าทางด่วนขากลับ) as new rows dated
  // today — เพิ่มรายการ / เพิ่มขากลับ still works the same for everything else.
  function applyTemplate(id: string) {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    const today = new Date().toISOString().slice(0, 10);
    setRows((prev) => {
      const fresh = tpl.items.map((it) => ({
        travel_date: today,
        from_location: it.from_location ?? "",
        to_location: it.to_location ?? "",
        mode: it.mode,
        km: it.km != null ? String(it.km) : "",
        amount: it.mode === "private_car" ? "" : String(it.amount),
        note: it.note ?? "",
      }));
      // Replace the form's single still-blank starter row instead of leaving
      // an empty row dangling above the template's rows.
      const base = prev.length === 1 && !prev[0].from_location && !prev[0].to_location ? [] : prev;
      return [...base, ...fresh];
    });
  }

  function saveAsTemplate() {
    if (!savingTemplateName?.trim()) return;
    const items = rows.map((r) => ({
      from_location: r.from_location || null,
      to_location: r.to_location || null,
      mode: r.mode,
      km: r.mode === "private_car" && r.km ? Number(r.km) : null,
      amount: rowAmount(r),
      note: r.note || null,
    }));
    const label = savingTemplateName;
    startTemplateTransition(async () => {
      const res = await saveTripTemplate(label, items);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setTemplates((prev) => [{ id: res.id!, label, items }, ...prev]);
      setSavingTemplateName(null);
    });
  }

  function removeTemplate(id: string) {
    startTemplateTransition(async () => {
      await deleteTripTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    });
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }
  function removeRow(i: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }
  // "ไป-กลับ": duplicate this row right after itself with จาก/ถึง swapped, so
  // the user only fills in the ขาไป leg once instead of retyping ขากลับ.
  function addReturnLeg(i: number) {
    setRows((prev) => {
      const r = prev[i];
      const returnLeg: Row = { ...r, from_location: r.to_location, to_location: r.from_location };
      return [...prev.slice(0, i + 1), returnLeg, ...prev.slice(i + 1)];
    });
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
      for (const f of files) fd.append("attachments", await compressImage(f));
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

          {templates.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface p-3">
              <Label className="flex items-center gap-1.5">
                <Route className="h-3.5 w-3.5" /> เส้นทางที่บันทึกไว้
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((t) => (
                  <div key={t.id} className="flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs">
                    <button type="button" onClick={() => applyTemplate(t.id)} className="font-medium text-foreground">
                      {t.label} ({t.items.length} รายการ)
                    </button>
                    <button type="button" onClick={() => removeTemplate(t.id)} disabled={templatePending} className="text-muted-foreground hover:text-danger">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                <LocationAutocomplete
                  placeholder="จาก"
                  value={r.from_location}
                  onChange={(v) => updateRow(i, { from_location: v })}
                  options={savedLocations}
                />
                <LocationAutocomplete
                  placeholder="ถึง"
                  value={r.to_location}
                  onChange={(v) => updateRow(i, { to_location: v })}
                  options={savedLocations}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start gap-1 text-xs text-muted-foreground"
                onClick={() => addReturnLeg(i)}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" /> เพิ่มขากลับ (สลับจาก-ถึง)
              </Button>
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

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={addRow} className="self-start">
              <Plus className="h-4 w-4" /> เพิ่มรายการ
            </Button>
            {savingTemplateName == null ? (
              <Button
                type="button"
                variant="outline"
                className="self-start gap-1.5"
                onClick={() => setSavingTemplateName("")}
                disabled={rows.every((r) => !r.from_location && !r.to_location)}
              >
                <Save className="h-4 w-4" /> บันทึกเป็นเส้นทางที่ใช้บ่อย
              </Button>
            ) : (
              <div className="flex w-full items-center gap-2">
                <Input
                  autoFocus
                  placeholder="ตั้งชื่อเส้นทาง เช่น บ้าน-โรงแรมแลนด์มาร์ค ไป-กลับ"
                  value={savingTemplateName}
                  onChange={(e) => setSavingTemplateName(e.target.value)}
                />
                <Button type="button" size="sm" disabled={templatePending || !savingTemplateName.trim()} onClick={saveAsTemplate}>
                  บันทึก
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSavingTemplateName(null)}>
                  ยกเลิก
                </Button>
              </div>
            )}
          </div>

          <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
            <span>รวมทั้งสิ้น</span>
            <span>{formatBaht(total)} บาท</span>
          </div>

          {/* Evidence images (Google Maps distance, receipts, ...) */}
          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <Label>แนบหลักฐาน (แคปแผนที่ / ใบเสร็จ — แนบได้หลายรูป)</Label>
            <input
              type="file"
              accept="image/*"
              multiple
              className="text-sm"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && <p className="text-xs text-muted-foreground">เลือกไว้ {files.length} รูป</p>}
            {existing && existing.attachment_urls.length > 0 && (
              <p className="text-xs text-muted-foreground">มีอยู่แล้ว {existing.attachment_urls.length} รูป (รูปใหม่จะเพิ่มต่อท้าย)</p>
            )}
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
