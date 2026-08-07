"use client";

import { Search } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type TimelineEntry = {
  kind: "worklog" | "field" | "leave";
  label: string;
  detail: string | null;
  time: string | null;
  status: string | null;
};

export type TimelineDay = {
  date: string;
  entries: TimelineEntry[];
};

const KIND_BADGE: Record<TimelineEntry["kind"], string> = {
  worklog: "bg-primary/10 text-primary",
  field: "bg-accent/20 text-accent-foreground",
  leave: "bg-warning/15 text-warning",
};

type Props = {
  month: string;
  person: string;
  employees: { id: string; full_name: string }[];
  days: TimelineDay[];
};

export function TimelineClient({ month, person, employees, days }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">เดือน</label>
          <input
            type="month"
            name="month"
            defaultValue={month}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        {employees.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">พนักงาน</label>
            <select
              name="person"
              defaultValue={person}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" className="gap-2">
          <Search className="h-4 w-4" /> ดูไทม์ไลน์
        </Button>
      </form>

      {days.length === 0 ? (
        <p className="text-sm text-muted-foreground px-1">ไม่พบข้อมูลการปฏิบัติงานในเดือนนี้</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {days.map((d) => (
            <li key={d.date} className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="mb-2 text-sm font-semibold text-foreground">
                {format(new Date(`${d.date}T00:00:00`), "d MMM yyyy")}
              </p>
              <ul className="flex flex-col gap-2">
                {d.entries.map((e, i) => (
                  <li key={i} className="flex flex-col gap-0.5 rounded-lg bg-background px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND_BADGE[e.kind]}`}>
                        {e.label}
                      </span>
                      <div className="flex items-center gap-2">
                        {e.time && <span className="text-xs text-muted-foreground">{e.time}</span>}
                        {e.status && <Badge variant="outline">{e.status}</Badge>}
                      </div>
                    </div>
                    {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
