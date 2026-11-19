import { cn } from "@/lib/utils";

export const MONTHS_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const round1 = (n: number) => Math.round(n * 10) / 10;

export function SummaryTile({
  label,
  value,
  unit,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface px-4 py-3", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold text-foreground">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export type BarSeries = { key: string; label: string; className: string };

/** 12-month stacked bar chart, plain divs (no chart lib, same approach as
 * the reports page). `values[i]` is month i (0 = Jan) keyed by series key. */
export function MonthlyBars({
  values,
  series,
  unit = "",
}: {
  values: Record<string, number>[];
  series: BarSeries[];
  unit?: string;
}) {
  const totals = values.map((v) => series.reduce((s, x) => s + (v[x.key] ?? 0), 0));
  const max = Math.max(...totals, 1);
  const grand = totals.reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-2">
      {grand === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">ไม่มีข้อมูลในปีนี้</p>
      ) : (
        <div className="flex h-32 items-end gap-1">
          {values.map((v, i) => {
            const total = totals[i];
            const parts = series
              .filter((s) => (v[s.key] ?? 0) > 0)
              .map((s) => `${s.label} ${round1(v[s.key])}${unit}`)
              .join(", ");
            const tip = `${MONTHS_TH[i]}: ${parts || "ไม่มี"}`;
            return (
              <div key={i} title={tip} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-0.5">
                <span className="h-3 text-[10px] leading-3 text-muted-foreground">{total > 0 ? round1(total) : ""}</span>
                <div
                  className="flex w-full flex-col-reverse overflow-hidden rounded-t"
                  style={{ height: total > 0 ? `max(2px, ${(total / max) * 78}%)` : 0 }}
                >
                  {series.map((s) => {
                    const val = v[s.key] ?? 0;
                    if (val <= 0) return null;
                    return <div key={s.key} className={s.className} style={{ height: `${(val / total) * 100}%` }} />;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex gap-1">
        {MONTHS_TH.map((m) => (
          <span key={m} className="min-w-0 flex-1 text-center text-[10px] text-muted-foreground">
            {m}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", s.className)} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal ranking bars (top-N). */
export function RankBars({ items, unit = "" }: { items: { name: string; value: number }[]; unit?: string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (items.length === 0) return <p className="py-2 text-xs text-muted-foreground">ไม่มีข้อมูล</p>;
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.name} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs text-muted-foreground" title={item.name}>
            {item.name}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
          <span className="w-12 text-right text-xs font-medium text-foreground">
            {round1(item.value)}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Year picker shown in Buddhist Era. */
export function YearSelect({ value, years, onChange }: { value: number; years: number[]; onChange: (y: number) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground outline-none"
      aria-label="เลือกปี"
    >
      {years.map((y) => (
        <option key={y} value={y}>
          ปี {y + 543}
        </option>
      ))}
    </select>
  );
}
