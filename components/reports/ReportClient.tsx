"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type DeptStat = { name: string; value: number };

export type ReportData = {
  leaveByType: DeptStat[];
  leaveByDept: DeptStat[];
  otByDept: { name: string; x1: number; x15: number; x3: number }[];
  otTotals: { x1: number; x15: number; x3: number };
  vanBookings: number;
  roomBookings: number;
  assets: { in_stock: number; assigned: number; broken: number; disposed: number };
  totalLeaveHours: number;
  totalOtHours: number;
};

function BarChart({ items, unit = "" }: { items: DeptStat[]; unit?: string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.name} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-xs text-muted-foreground truncate">{item.name}</span>
          <div className="flex-1 rounded-full bg-border h-2 overflow-hidden">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
          <span className="w-14 text-right text-xs font-medium text-foreground">
            {item.value}{unit}
          </span>
        </div>
      ))}
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground">ไม่มีข้อมูลในช่วงเวลานี้</p>
      )}
    </div>
  );
}

function OtBarChart({ items }: { items: ReportData["otByDept"] }) {
  const max = Math.max(...items.map((i) => i.x1 + i.x15 + i.x3), 1);
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const total = item.x1 + item.x15 + item.x3;
        return (
          <div key={item.name} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-xs text-muted-foreground truncate">{item.name}</span>
            <div className="flex-1 flex rounded-full bg-border h-2 overflow-hidden">
              <div className="h-2 bg-primary/60" style={{ width: `${(item.x1 / max) * 100}%` }} />
              <div className="h-2 bg-primary" style={{ width: `${(item.x15 / max) * 100}%` }} />
              <div className="h-2 bg-accent" style={{ width: `${(item.x3 / max) * 100}%` }} />
            </div>
            <span className="w-14 text-right text-xs font-medium text-foreground">{total} ชม.</span>
          </div>
        );
      })}
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground">ไม่มีข้อมูลในช่วงเวลานี้</p>
      )}
    </div>
  );
}

type Props = {
  from: string;
  to: string;
  data: ReportData;
  departments?: { id: string; name: string }[];
  employees?: { id: string; full_name: string; department_id: string }[];
  currentDept?: string;
  currentPerson?: string;
};

export function ReportClient({ from, to, data, departments = [], employees = [], currentDept = "", currentPerson = "" }: Props) {
  const assetTotal =
    data.assets.in_stock + data.assets.assigned + data.assets.broken + data.assets.disposed;

  return (
    <div className="flex flex-col gap-5">
      {/* Filters — native GET form for reliable mobile behavior */}
      <form method="GET" className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        {/* Date range */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">ตั้งแต่วันที่</label>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="w-40 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">ถึงวันที่</label>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="w-40 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        {/* Scope — dept / person / org */}
        <div className="flex flex-wrap gap-2">
          {/* dept filter */}
          {departments.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">รายฝ่าย</label>
              <select
                name="dept"
                defaultValue={currentDept}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">ทั้งองค์กร</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* person filter */}
          {employees.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">รายคน</label>
              <select
                name="person"
                defaultValue={currentPerson}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">ทุกคน</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <Button type="submit" className="gap-2 self-start">
          <Search className="h-4 w-4" /> ดูรายงาน
        </Button>
      </form>

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "ชั่วโมงลา", value: data.totalLeaveHours, unit: " ชม." },
          { label: "ชั่วโมง OT", value: data.totalOtHours, unit: " ชม." },
          { label: "จองรถตู้", value: data.vanBookings, unit: " ครั้ง" },
          { label: "จองห้องประชุม", value: data.roomBookings, unit: " ครั้ง" },
        ].map(({ label, value, unit }) => (
          <div
            key={label}
            className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface px-4 py-3"
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold text-foreground">
              {value}
              <span className="text-sm font-normal text-muted-foreground">{unit}</span>
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Leave by type */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">ชั่วโมงลาแยกตามประเภท</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart items={data.leaveByType} unit=" ชม." />
          </CardContent>
        </Card>

        {/* Leave by dept */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">ชั่วโมงลาแยกตามฝ่าย</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart items={data.leaveByDept} unit=" ชม." />
          </CardContent>
        </Card>

        {/* OT by dept */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">OT แยกตามฝ่าย</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="inline-block h-2 w-3 rounded-full bg-primary/60 mr-1" />x1
              <span className="inline-block h-2 w-3 rounded-full bg-primary mx-1 ml-2" />x1.5
              <span className="inline-block h-2 w-3 rounded-full bg-accent mx-1 ml-2" />x3
            </p>
          </CardHeader>
          <CardContent>
            <OtBarChart items={data.otByDept} />
            <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
              <span>x1 = {data.otTotals.x1} ชม.</span>
              <span>x1.5 = {data.otTotals.x15} ชม.</span>
              <span>x3 = {data.otTotals.x3} ชม.</span>
            </div>
          </CardContent>
        </Card>

        {/* Asset status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">สถานะทรัพย์สิน ({assetTotal} รายการ)</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              items={[
                { name: "ในคลัง", value: data.assets.in_stock },
                { name: "มอบหมายแล้ว", value: data.assets.assigned },
                { name: "ชำรุด", value: data.assets.broken },
                { name: "จำหน่าย", value: data.assets.disposed },
              ]}
              unit=" ชิ้น"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
