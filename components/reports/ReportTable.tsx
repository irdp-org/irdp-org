"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type ReportRow = {
  id: string;
  category: "ลา" | "นอกสถานที่/OT/WFH";
  typeLabel: string;
  employeeName: string;
  deptName: string;
  date: string; // yyyy-MM-dd
  amountLabel: string;
  status: string;
  statusLabel: string;
  detail: string | null;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  submitted: "secondary",
  approved: "default",
  rejected: "destructive",
  returned: "destructive",
  cancelled: "outline",
};

export function ReportTable({ rows }: { rows: ReportRow[] }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

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

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">วันที่</th>
                <th className="px-3 py-2 font-medium">ประเภท</th>
                <th className="px-3 py-2 font-medium">ชื่อ</th>
                <th className="px-3 py-2 font-medium">ฝ่าย</th>
                <th className="px-3 py-2 font-medium">จำนวน</th>
                <th className="px-3 py-2 font-medium">รายละเอียด</th>
                <th className="px-3 py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-foreground">
                    {format(new Date(`${r.date}T00:00:00`), "d MMM yyyy")}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-foreground">{r.typeLabel}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-foreground">{r.employeeName}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{r.deptName}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-foreground">{r.amountLabel}</td>
                  <td className="max-w-[240px] truncate px-3 py-2 text-muted-foreground">{r.detail || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>{r.statusLabel}</Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    ไม่พบรายการที่ตรงกับตัวกรอง
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
