"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ReportRow = {
  id: string;
  category: "ลา" | "นอกสถานที่/OT/WFH";
  typeLabel: string;
  employeeName: string;
  deptName: string;
  date: string; // yyyy-MM-dd
  startTime: string | null; // HH:mm
  endTime: string | null;
  amountLabel: string;
  status: string;
  statusLabel: string;
  detail: string | null;
  locationLabel: string | null;
  radiusLabel: string | null;
  photos: { url: string; label: string }[];
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  submitted: "secondary",
  approved: "default",
  rejected: "destructive",
  returned: "destructive",
  cancelled: "outline",
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

export function ReportTable({ rows }: { rows: ReportRow[] }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [selected, setSelected] = useState<ReportRow | null>(null);

  const depts = useMemo(
    () => [...new Set(rows.map((r) => r.deptName))].sort((a, b) => a.localeCompare(b, "th")),
    [rows]
  );
  const [dept, setDept] = useState<string>("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (status !== "all" && r.status !== status) return false;
      if (dept !== "all" && r.deptName !== dept) return false;
      if (!needle) return true;
      return (
        r.employeeName.toLowerCase().includes(needle) ||
        r.typeLabel.toLowerCase().includes(needle) ||
        r.deptName.toLowerCase().includes(needle) ||
        (r.detail ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, category, status, dept]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">รายการทั้งหมด ({filtered.length} จาก {rows.length})</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Search + filters */}
        <div className="flex flex-wrap gap-2">
          <div className="flex flex-1 min-w-[180px] items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ / ฝ่าย / รายละเอียด..."
              className="w-full bg-transparent outline-none"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">ทุกประเภท</option>
            <option value="ลา">ลา</option>
            <option value="นอกสถานที่/OT/WFH">นอกสถานที่/OT/WFH</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">ทุกสถานะ</option>
            <option value="draft">ฉบับร่าง</option>
            <option value="submitted">รออนุมัติ</option>
            <option value="approved">อนุมัติแล้ว</option>
            <option value="rejected">ไม่อนุมัติ</option>
            <option value="returned">ตีกลับ</option>
            <option value="cancelled">ยกเลิก</option>
          </select>
          {depts.length > 0 && (
            <select
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">ทุกฝ่าย</option>
              {depts.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}
        </div>

        {/* Table — "จำนวน" column dropped from the grid itself (still shown
         * in the detail popup below) so the table stays readable without a
         * horizontal scrollbar on most screens. */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">วันที่</th>
                <th className="px-3 py-2 font-medium">ประเภท</th>
                <th className="px-3 py-2 font-medium">ชื่อ</th>
                <th className="px-3 py-2 font-medium">ฝ่าย</th>
                <th className="px-3 py-2 font-medium">รายละเอียด</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-surface"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-foreground">
                    {format(new Date(`${r.date}T00:00:00`), "d MMM yyyy")}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-foreground">{r.typeLabel}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-foreground">{r.employeeName}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{r.deptName}</td>
                  <td className="max-w-[240px] truncate px-3 py-2 text-muted-foreground">{r.detail || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>{r.statusLabel}</Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    ไม่พบรายการที่ตรงกับตัวกรอง
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>

      {/* Row detail — everything about the request in one place: time,
       * date, location/radius (offsite), photos, quantity, status. */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selected?.typeLabel}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="flex flex-col gap-3">
              <DetailRow label="ชื่อ" value={selected.employeeName} />
              <DetailRow label="ฝ่าย" value={selected.deptName} />
              <DetailRow
                label="วันที่"
                value={format(new Date(`${selected.date}T00:00:00`), "d MMMM yyyy")}
              />
              <DetailRow
                label="เวลา"
                value={selected.startTime && selected.endTime ? `${selected.startTime}–${selected.endTime} น.` : null}
              />
              <DetailRow label="สถานที่" value={selected.locationLabel} />
              <DetailRow label="รัศมีที่บันทึก" value={selected.radiusLabel} />
              <DetailRow label="จำนวน" value={selected.amountLabel} />
              <DetailRow label="รายละเอียด" value={selected.detail} />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">สถานะ</span>
                <Badge variant={STATUS_VARIANT[selected.status] ?? "outline"} className="w-fit">
                  {selected.statusLabel}
                </Badge>
              </div>
              {selected.photos.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">รูปภาพ/เอกสารแนบ</span>
                  <div className="flex flex-wrap gap-2">
                    {selected.photos.map((p, i) => (
                      <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" title={p.label}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- signed/short-lived URL */}
                        <img src={p.url} alt={p.label} className="h-20 w-20 rounded-lg object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
