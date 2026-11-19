import type { ReactNode } from "react";
import { X } from "lucide-react";
import { bkkDateKey } from "@/lib/format-th";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string };

export type FilterSelect = {
  key: string;
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: FilterOption[];
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const atNoon = (key: string) => new Date(`${key}T12:00:00Z`);
const addDays = (key: string, n: number) => {
  const d = atNoon(key);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
};

/** Quick period shortcuts, computed from today in Bangkok time. */
function periodPresets(): { label: string; from: string; to: string }[] {
  const today = bkkDateKey(new Date());
  const [y, m] = today.split("-").map(Number);
  const mondayOffset = (atNoon(today).getUTCDay() + 6) % 7; // week runs Mon-Sun
  const weekStart = addDays(today, -mondayOffset);
  return [
    { label: "วันนี้", from: today, to: today },
    { label: "สัปดาห์นี้", from: weekStart, to: addDays(weekStart, 6) },
    { label: "เดือนนี้", from: ymd(new Date(Date.UTC(y, m - 1, 1))), to: ymd(new Date(Date.UTC(y, m, 0))) },
    { label: "เดือนที่แล้ว", from: ymd(new Date(Date.UTC(y, m - 2, 1))), to: ymd(new Date(Date.UTC(y, m - 1, 0))) },
    { label: "ปีนี้", from: `${y}-01-01`, to: `${y}-12-31` },
  ];
}

const boxCls = "flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-sm";
const selectCls = "bg-transparent text-sm text-foreground outline-none";

/** Shared filter row for the leave / field request lists (own + approvals):
 * free-text search, any number of dropdowns, a date range, an optional extra
 * slot, a result count and a "clear all". */
export function RequestFilterBar({
  search,
  onSearch,
  searchPlaceholder = "ค้นหา...",
  selects,
  from,
  to,
  onFrom,
  onTo,
  extra,
  shown,
  total,
  onClear,
  active,
}: {
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder?: string;
  selects: FilterSelect[];
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  extra?: ReactNode;
  shown: number;
  total: number;
  onClear: () => void;
  active: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 min-w-[160px] flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        {selects.map((s) => (
          <div key={s.key} className={boxCls}>
            <select value={s.value} onChange={(e) => s.onChange(e.target.value)} className={selectCls}>
              <option value="all">{s.allLabel}</option>
              {s.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ))}
        {extra}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">ช่วงเวลา:</span>
        {periodPresets().map((p) => {
          const on = from === p.from && to === p.to;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                onFrom(p.from);
                onTo(p.to);
              }}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-surface"
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className={boxCls}>
          <input
            type="date"
            value={from}
            onChange={(e) => onFrom(e.target.value)}
            className="bg-transparent text-sm outline-none"
            aria-label="ตั้งแต่วันที่"
          />
          <span className="text-muted-foreground">ถึง</span>
          <input
            type="date"
            value={to}
            onChange={(e) => onTo(e.target.value)}
            className="bg-transparent text-sm outline-none"
            aria-label="ถึงวันที่"
          />
        </div>
        {active && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> ล้างตัวกรอง
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          แสดง {shown} จาก {total} รายการ
        </span>
      </div>
    </div>
  );
}
