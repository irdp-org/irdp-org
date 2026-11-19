"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthlyBars, RankBars, SummaryTile, YearSelect, type BarSeries } from "@/components/shared/summary";
import { bkkYearMonth } from "@/lib/format-th";
import type { MyApprovalAction } from "@/lib/my-approval-actions";

export type ApprovalSummaryRow = {
  requester: string;
  my: MyApprovalAction | null;
};

const SERIES: BarSeries[] = [
  { key: "ok", label: "อนุมัติ/รับทราบ", className: "bg-success" },
  { key: "ret", label: "ตีกลับ", className: "bg-warning" },
  { key: "no", label: "ปฏิเสธ/ยกเลิก", className: "bg-danger" },
];

/** Dashboard on top of an approvals tab: what is waiting for me, how much
 * I've acted on, month by month, and whose requests I handle most. */
export function ApprovalSummary({
  rows,
  pendingLabel,
  pendingCount,
}: {
  rows: ApprovalSummaryRow[];
  pendingLabel: string;
  pendingCount: number;
}) {
  const now = bkkYearMonth(new Date().toISOString());
  const [year, setYear] = useState(now.y);

  const mine = useMemo(
    () => rows.filter((r) => r.my).map((r) => ({ ...r, ...bkkYearMonth(r.my!.created_at) })),
    [rows]
  );
  const years = useMemo(() => Array.from(new Set([now.y, ...mine.map((r) => r.y)])).sort((a, b) => b - a), [mine, now.y]);

  const inYear = mine.filter((r) => r.y === year);
  const thisMonth = mine.filter((r) => r.y === now.y && r.m === now.m).length;

  const values = Array.from({ length: 12 }, (_, m) => {
    const v = { ok: 0, ret: 0, no: 0 };
    for (const r of inYear) {
      if (r.m !== m) continue;
      const a = r.my!.action;
      if (a === "approve" || a === "acknowledge") v.ok += 1;
      else if (a === "return") v.ret += 1;
      else v.no += 1;
    }
    return v;
  });

  const topRequesters = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of inYear) counts.set(r.requester, (counts.get(r.requester) ?? 0) + 1);
    return [...counts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [inYear]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryTile label={pendingLabel} value={pendingCount} unit="รายการ" className={pendingCount > 0 ? "border-warning/50" : undefined} />
        <SummaryTile label="ที่ฉันดำเนินการเดือนนี้" value={thisMonth} unit="รายการ" />
        <SummaryTile label={`ที่ฉันดำเนินการทั้งปี ${year + 543}`} value={inYear.length} unit="รายการ" className="col-span-2 sm:col-span-1" />
      </div>
      <div className="grid gap-3 md:grid-cols-5">
        <Card className="md:col-span-3">
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm">การดำเนินการของฉันรายเดือน</CardTitle>
            <YearSelect value={year} years={years} onChange={setYear} />
          </CardHeader>
          <CardContent>
            <MonthlyBars values={values} series={SERIES} unit=" รายการ" />
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">ใครขอให้ฉันดำเนินการบ่อยที่สุด ({year + 543})</CardTitle>
          </CardHeader>
          <CardContent>
            <RankBars items={topRequesters} unit=" ครั้ง" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
