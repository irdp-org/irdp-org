/**
 * Thai, Buddhist-Era date formatting — "-u-ca-buddhist" makes Intl compute
 * the +543 year itself rather than us doing date arithmetic, and also
 * switches month/day names to Thai for free. Centralized here so every
 * page shows the same "18 พ.ย. 2569" shape instead of each component
 * picking its own date-fns pattern (which defaults to English/Gregorian
 * unless a locale is explicitly passed in).
 */
const TZ = "Asia/Bangkok";

export function formatThaiDate(
  value: string | Date,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }
): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("th-TH-u-ca-buddhist", { timeZone: TZ, ...opts });
}

/** "18 พ.ย. 2569 08:30" */
export function formatThaiDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const date = formatThaiDate(d);
  const time = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
  return `${date} ${time}`;
}

/** 24-hour "08:30" — thin wrapper so call sites don't repeat the hour12:false option. */
export function formatThaiTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
}

/** "yyyy-MM-dd" of an instant as seen in Bangkok, for date-range filtering
 * (slicing the UTC ISO string is off by a day for anything before 07:00 BKK). */
export function bkkDateKey(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Year (Gregorian) and 0-based month of an instant as seen in Bangkok. */
export function bkkYearMonth(value: string | Date): { y: number; m: number } {
  const d = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "numeric" }).formatToParts(d);
  return {
    y: Number(parts.find((p) => p.type === "year")?.value),
    m: Number(parts.find((p) => p.type === "month")?.value) - 1,
  };
}
