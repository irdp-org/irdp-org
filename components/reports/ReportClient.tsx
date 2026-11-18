"use client";

import { useMemo, useState } from "react";
import { Download, Search, CalendarClock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type DeptStat = { name: string; value: number };

export type ReportData = {
  leaveByType: DeptStat[];
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

type Props = {
  from: string;
  to: string;
  data: ReportData;
  departments?: { id: string; name: string }[];
  employees?: { id: string; full_name: string; department_id: string }[];
  currentDept?: string;
  currentPerson?: string;
  scopeLabel?: string;
};

export function ReportClient({
  from,
  to,
  data,
  departments = [],
  employees = [],
  currentDept = "",
  currentPerson = "",
  scopeLabel = "ทั้งองค์กร",
}: Props) {
  // Picking a department narrows the person dropdown to just that
  // department's people, instead of showing everyone regardless of scope.
  const [deptChoice, setDeptChoice] = useState(currentDept);
  const visibleEmployees = useMemo(
    () => (deptChoice ? employees.filter((e) => e.department_id === deptChoice) : employees),
    [employees, deptChoice]
  );

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/reports/timeline"
        className="inline-flex w-fit items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground shadow-sm hover:bg-secondary/80 transition-colors"
      >
        <CalendarClock className="h-4 w-4" /> ดูไทม์ไลน์รายบุคคล (รวมทุกกิจกรรมรายวัน)
      </Link>

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
                value={deptChoice}
                onChange={(e) => setDeptChoice(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">ทั้งองค์กร</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* person filter — narrowed to the chosen department above */}
          {employees.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">รายคน</label>
              <select
                name="person"
                defaultValue={currentPerson}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">ทุกคน</option>
                {visibleEmployees.map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="gap-2">
            <Search className="h-4 w-4" /> ดูรายงาน
          </Button>
          <a
            href={`/reports/export?from=${from}&to=${to}${currentDept ? `&dept=${currentDept}` : ""}${currentPerson ? `&person=${currentPerson}` : ""}`}
            download
            className="inline-flex items-center gap-2 rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground shadow-sm hover:bg-secondary/80 transition-colors"
          >
            <Download className="h-4 w-4" /> ดาวน์โหลด CSV
          </a>
        </div>
      </form>

      <p className="text-sm text-muted-foreground">
        กำลังดูข้อมูลของ: <span className="font-medium text-foreground">{scopeLabel}</span>
      </p>

      {/* Summary row */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex gap-3 sm:flex-col sm:w-40 sm:shrink-0">
          {[
            { label: "ชั่วโมงลา", value: data.totalLeaveHours, unit: " ชม." },
            { label: "ชั่วโมง OT", value: data.totalOtHours, unit: " ชม." },
          ].map(({ label, value, unit }) => (
            <div
              key={label}
              className="flex flex-1 flex-col gap-0.5 rounded-xl border border-border bg-surface px-4 py-3"
            >
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold text-foreground">
                {value}
                <span className="text-sm font-normal text-muted-foreground">{unit}</span>
              </p>
            </div>
          ))}
        </div>

        <Card className="flex-1">
          <CardHeader>
            <CardTitle className="text-sm">ชั่วโมงลาแยกตามประเภท — {scopeLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart items={data.leaveByType} unit=" ชม." />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
