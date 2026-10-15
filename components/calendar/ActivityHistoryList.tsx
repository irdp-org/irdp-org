"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { History, GraduationCap, User, MapPin, Pencil, Users, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { EventSheet, type ExistingOrgEvent } from "./EventSheet";
import { getActivityCheckinRoster } from "@/app/(app)/field/activity-checkin-actions";

export type ActivityHistoryRow = {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  location: string | null;
  is_training: boolean;
  organizer: string | null;
  instructor: string | null;
};

type RosterEntry = {
  employeeName: string;
  location: string | null;
  checkedInAt: string;
  checkedOutAt: string | null;
  distanceM: number | null;
  withinRadius: boolean | null;
};

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// canManage (admin/hr) gets two extra actions on every row, including ones
// long in the past: "แก้ไข" reuses the same EventSheet the calendar grid
// uses (retroactive edits), and "ดูรายชื่อผู้เช็คอิน" pulls up the
// check-in/check-out roster — the self-service check-in widget on /checkin
// only keeps a rolling 14-day window, so this is the only place left to
// look up an older training's registrants.
export function ActivityHistoryList({
  activities,
  canManage = false,
}: {
  activities: ActivityHistoryRow[];
  canManage?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityHistoryRow | null>(null);
  const [rosterFor, setRosterFor] = useState<ActivityHistoryRow | null>(null);
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [, startTransition] = useTransition();
  const now = new Date();

  const upcoming = activities.filter((a) => new Date(a.end_at ?? a.start_at) >= now);
  const past = activities
    .filter((a) => new Date(a.end_at ?? a.start_at) < now)
    .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime());

  function openRoster(a: ActivityHistoryRow) {
    setRosterFor(a);
    setRoster(null);
    setRosterLoading(true);
    startTransition(async () => {
      const res = await getActivityCheckinRoster(a.id);
      setRosterLoading(false);
      setRoster("error" in res ? [] : res.roster);
    });
  }

  function exportRosterCsv() {
    if (!rosterFor || !roster) return;
    const rows = [
      ["ชื่อ-นามสกุล", "เวลาเช็คอิน", "เวลาเช็คเอ้าท์", "รูปแบบ", "ระยะห่าง (ม.)", "อยู่ในรัศมี"],
      ...roster.map((r) => [
        r.employeeName,
        format(new Date(r.checkedInAt), "dd/MM/yyyy HH:mm"),
        r.checkedOutAt ? format(new Date(r.checkedOutAt), "dd/MM/yyyy HH:mm") : "",
        r.location ?? "",
        r.distanceM != null ? String(r.distanceM) : "",
        r.withinRadius == null ? "" : r.withinRadius ? "ใช่" : "ไม่",
      ]),
    ];
    downloadCsv(`ผู้ลงทะเบียน-${rosterFor.title}-${format(new Date(), "yyyyMMdd")}.csv`, rows);
  }

  function renderRow(a: ActivityHistoryRow) {
    const start = new Date(a.start_at);
    const end = a.end_at ? new Date(a.end_at) : null;
    return (
      <div key={a.id} className="flex flex-col gap-1 rounded-lg bg-surface px-3 py-2 text-sm">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          {a.is_training && <GraduationCap className="h-3.5 w-3.5 shrink-0 text-primary" />}
          {a.title}
        </span>
        <span className="text-xs text-muted-foreground">
          {format(start, "d MMMM yyyy", { locale: th })}
          {!a.all_day && ` · ${format(start, "HH:mm")}${end ? `–${format(end, "HH:mm")}` : ""} น.`}
          {a.location && (
            <span className="inline-flex items-center gap-0.5">
              {" · "}
              <MapPin className="h-3 w-3" /> {a.location}
            </span>
          )}
        </span>
        {(a.organizer || a.instructor) && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            {[a.organizer ? `จัดโดย ${a.organizer}` : null, a.instructor ? `วิทยากร ${a.instructor}` : null].filter(Boolean).join(" · ")}
          </span>
        )}
        {canManage && (
          <div className="mt-1 flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setEditing(a)}>
              <Pencil className="h-3.5 w-3.5" /> แก้ไข
            </Button>
            <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground" onClick={() => openRoster(a)}>
              <Users className="h-3.5 w-3.5" /> ผู้เช็คอิน
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-1.5 self-start" onClick={() => setOpen(true)}>
        <History className="h-4 w-4" /> ประวัติกิจกรรม
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ประวัติกิจกรรม</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">กำลังจะถึง</p>
              {upcoming.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">ไม่มีกิจกรรมที่กำลังจะถึง</p>
              ) : (
                <div className="flex flex-col gap-2">{upcoming.map(renderRow)}</div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">ผ่านมาแล้ว</p>
              {past.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">ยังไม่มีประวัติ</p>
              ) : (
                <div className={cn("flex flex-col gap-2")}>{past.map(renderRow)}</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {canManage && (
        <EventSheet
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          existing={
            editing
              ? ({
                  id: editing.id,
                  title: editing.title,
                  description: editing.description,
                  type: "activity",
                  start_at: editing.start_at,
                  end_at: editing.end_at,
                  all_day: editing.all_day,
                  location: editing.location,
                  is_training: editing.is_training,
                  organizer: editing.organizer,
                  instructor: editing.instructor,
                } as ExistingOrgEvent)
              : null
          }
        />
      )}

      {canManage && (
        <Dialog open={!!rosterFor} onOpenChange={(o) => !o && setRosterFor(null)}>
          <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-sm">
            {rosterFor && (
              <>
                <DialogHeader>
                  <DialogTitle>
                    ผู้เช็คอิน: {rosterFor.title}
                    {roster && ` (${roster.length} คน)`}
                  </DialogTitle>
                </DialogHeader>
                {roster && roster.length > 0 && (
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 self-start" onClick={exportRosterCsv}>
                    <Download className="h-3.5 w-3.5" /> ดาวน์โหลด CSV
                  </Button>
                )}
                <div className="flex flex-col gap-2">
                  {rosterLoading ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">กำลังโหลด...</p>
                  ) : !roster || roster.length === 0 ? (
                    <p className="py-4 text-center text-sm text-muted-foreground">ยังไม่มีใครเช็คอิน</p>
                  ) : (
                    roster.map((r, i) => (
                      <div key={i} className="flex flex-col gap-0.5 rounded-lg bg-surface px-3 py-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">{r.employeeName}</span>
                          {r.checkedOutAt ? (
                            <span className="text-xs text-primary">เช็คเอ้าท์แล้ว</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">ยังไม่เช็คเอ้าท์</span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(r.checkedInAt), "d MMM HH:mm", { locale: th })} น.
                          {r.checkedOutAt && ` – ${format(new Date(r.checkedOutAt), "HH:mm")} น.`}
                          {r.location && ` · ${r.location}`}
                          {r.distanceM != null && ` · ห่าง ${r.distanceM} ม.`}
                          {r.withinRadius === false && " (นอกรัศมี)"}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
