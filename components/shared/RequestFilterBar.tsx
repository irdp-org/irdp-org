import type { ReactNode } from "react";
import { X } from "lucide-react";

export type FilterOption = { value: string; label: string };

export type FilterSelect = {
  key: string;
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: FilterOption[];
};

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
