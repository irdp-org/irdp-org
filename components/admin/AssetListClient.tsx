"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Package,
  Plus,
  Pencil,
  UserPlus,
  History,
  AlertTriangle,
  Download,
  Search,
  X,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/shell/EmptyState";
import { AssetSheet, CATEGORIES, type AssetRow } from "./AssetSheet";
import { AssignSheet } from "./AssignSheet";
import { AssetHistorySheet, type AssignmentRow } from "./AssetHistorySheet";
import { changeAssetStatus, deleteAsset } from "@/app/(app)/assets/actions";

const STATUS_META: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  in_stock: { label: "คลัง", variant: "secondary" },
  assigned: { label: "มอบหมาย", variant: "default" },
  returned: { label: "ส่งคืน", variant: "outline" },
  broken: { label: "เสีย", variant: "destructive" },
  disposed: { label: "จำหน่าย", variant: "outline" },
};

type Employee = { id: string; full_name: string; department_id: string | null };

type Props = {
  assets: AssetRow[];
  employeeList: Employee[];
  allAssignments: AssignmentRow[];
  isAdmin: boolean;
};

function exportCSV(assets: AssetRow[], employeeNameMap: Map<string, string>) {
  const headers = ["รหัส", "หมวดหมู่", "ชื่อ", "ยี่ห้อ", "รุ่น", "Serial", "ผู้ครอบครอง", "สถานะ", "ราคา", "วันที่ซื้อ", "License หมดอายุ"];
  const rows = assets.map((a) => [
    a.asset_tag,
    CATEGORIES.find((c) => c.value === a.category)?.label ?? a.category,
    a.name,
    a.brand ?? "",
    a.model ?? "",
    a.serial ?? "",
    a.holder?.full_name ?? "",
    STATUS_META[a.status]?.label ?? a.status,
    a.price != null ? a.price.toString() : "",
    a.purchase_date ?? "",
    a.license_expires_at ?? "",
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `assets_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function isExpiringSoon(asset: AssetRow) {
  if (!asset.license_expires_at) return false;
  const exp = new Date(asset.license_expires_at + "T00:00:00");
  const warn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return exp <= warn;
}

function StatusChangeDialog({
  asset,
  isAdmin,
}: {
  asset: AssetRow;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"broken" | "disposed" | "in_stock">("broken");
  const [isPending, startTransition] = useTransition();

  if (!isAdmin || asset.status === "assigned") return null;

  function handleConfirm() {
    startTransition(async () => {
      await changeAssetStatus(asset.id, status, note);
      setNote("");
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" className="shrink-0 text-muted-foreground hover:text-warning" title="เปลี่ยนสถานะ">
          <AlertTriangle className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>เปลี่ยนสถานะทรัพย์สิน</AlertDialogTitle>
          <AlertDialogDescription>
            {asset.asset_tag} — {asset.name}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3 px-4">
          <div className="flex flex-col gap-1.5">
            <Label>สถานะใหม่</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="broken">เสีย</SelectItem>
                <SelectItem value="disposed">จำหน่ายทิ้ง</SelectItem>
                <SelectItem value="in_stock">คืนคลัง (ซ่อมแล้ว)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>หมายเหตุ (ไม่บังคับ)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
            ยืนยัน
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteAssetDialog({ asset }: { asset: AssetRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-danger" title="ลบ">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>ลบทรัพย์สินถาวร</AlertDialogTitle>
          <AlertDialogDescription>
            ลบ {asset.name}{asset.asset_tag ? ` (${asset.asset_tag})` : ""} และประวัติการมอบหมายออกจากระบบถาวร ไม่สามารถกู้คืนได้
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
          <AlertDialogAction
            className="bg-danger hover:bg-danger/90"
            disabled={isPending}
            onClick={() => startTransition(async () => { await deleteAsset(asset.id); router.refresh(); })}
          >
            ลบถาวร
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AssetListClient({ assets, employeeList, allAssignments, isAdmin }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<AssetRow | null>(null);
  const [assignSheetOpen, setAssignSheetOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<AssetRow | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyAsset, setHistoryAsset] = useState<AssetRow | null>(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const employeeNameMap = new Map(employeeList.map((e) => [e.id, e.full_name]));

  const filtered = assets.filter((a) => {
    if (filterCat !== "all" && a.category !== filterCat) return false;
    if (filterStatus !== "all" && a.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (a.asset_tag ?? "").toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.brand ?? "").toLowerCase().includes(q) ||
        (a.serial ?? "").toLowerCase().includes(q) ||
        (a.note ?? "").toLowerCase().includes(q) ||
        (a.holder?.full_name ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-4 px-4 md:px-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {isAdmin && (
          <Button
            onClick={() => {
              setEditAsset(null);
              setSheetOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> เพิ่มทรัพย์สิน
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => exportCSV(filtered, employeeNameMap)}
          className="gap-1.5"
        >
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[160px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="ค้นหา..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() => setSearch("")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-36"><SelectValue placeholder="หมวดหมู่" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกหมวด</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="สถานะ" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกสถานะ</SelectItem>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">{filtered.length} รายการ</p>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState icon={Package} title="ไม่พบทรัพย์สิน" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">รหัส</th>
                <th className="px-3 py-2 font-medium">ชื่อ / รุ่น</th>
                <th className="px-3 py-2 font-medium">Serial</th>
                <th className="px-3 py-2 font-medium">ผู้ครอบครอง</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
                <th className="px-3 py-2 font-medium text-right">ราคา</th>
                <th className="px-3 py-2 font-medium">หมายเหตุ</th>
                <th className="px-3 py-2 font-medium text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((asset) => {
                const { label, variant } = STATUS_META[asset.status] ?? { label: asset.status, variant: "secondary" };
                const expiring = isExpiringSoon(asset);
                return (
                  <tr key={asset.id} className="border-b border-border last:border-0 align-top hover:bg-surface/60">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">{asset.asset_tag ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{asset.name}</div>
                      {(asset.brand || asset.model) && (
                        <div className="text-xs text-muted-foreground">{[asset.brand, asset.model].filter(Boolean).join(" · ")}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{asset.serial ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{asset.holder?.full_name ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant={variant} className="text-xs">{label}</Badge>
                      {expiring && <Badge variant="destructive" className="ml-1 text-xs">License ใกล้หมด</Badge>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-xs">{asset.price != null ? asset.price.toLocaleString("th-TH") : "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[260px]">{asset.note ?? ""}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" title="ประวัติ"
                          onClick={() => { setHistoryAsset(asset); setHistoryOpen(true); }}>
                          <History className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" title="แก้ไข"
                              onClick={() => { setEditAsset(asset); setSheetOpen(true); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {asset.status === "in_stock" && (
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" title="มอบหมาย"
                                onClick={() => { setAssignTarget(asset); setAssignSheetOpen(true); }}>
                                <UserPlus className="h-4 w-4" />
                              </Button>
                            )}
                            <StatusChangeDialog asset={asset} isAdmin={isAdmin} />
                            <DeleteAssetDialog asset={asset} />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sheets */}
      <AssetSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        existing={editAsset}
      />
      <AssignSheet
        open={assignSheetOpen}
        onOpenChange={setAssignSheetOpen}
        asset={assignTarget}
        employees={employeeList}
      />
      <AssetHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        asset={historyAsset}
        assignments={allAssignments}
        employeeNameMap={employeeNameMap}
      />
    </div>
  );
}
