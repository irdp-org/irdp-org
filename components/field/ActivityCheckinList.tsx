"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import {
  CalendarCheck,
  MapPin,
  Video,
  CheckCircle2,
  AlertTriangle,
  LocateFixed,
  GraduationCap,
  User,
  Users,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { haversineDistanceMeters } from "@/lib/geo";
import {
  checkInActivity,
  checkOutActivity,
  getActivityCheckinRoster,
  type ActivityCheckinMode,
} from "@/app/(app)/field/activity-checkin-actions";

export type UpcomingActivity = {
  id: string;
  title: string;
  start_at: string;
  end_at: string | null;
  location: string | null;
  is_training: boolean;
  organizer: string | null;
  instructor: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
};

type RosterEntry = {
  employeeName: string;
  location: string | null;
  checkedInAt: string;
  checkedOutAt: string | null;
  distanceM: number | null;
  withinRadius: boolean | null;
};

// Known HQ coordinates for an immediate "~Xm away" estimate client-side —
// the server recomputes this itself against work_locations before trusting it.
const HQ_COORDS = { lat: 13.7787884919528, lng: 100.543693900108 };
const HQ_RADIUS_M = 200;

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

function useGeo() {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  function request() {
    if (!("geolocation" in navigator)) {
      setGeoError("เบราว์เซอร์นี้ไม่รองรับ GPS");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      (err) => {
        setGeoError(err.message || "ขอตำแหน่ง GPS ไม่สำเร็จ");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  function reset() {
    setCoords(null);
    setGeoError(null);
  }

  return { coords, locating, geoError, request, reset };
}

export function ActivityCheckinList({
  activities,
  canViewRoster,
}: {
  activities: UpcomingActivity[];
  canViewRoster: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<UpcomingActivity | null>(null);
  const [mode, setMode] = useState<ActivityCheckinMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const geo = useGeo();

  const [rosterFor, setRosterFor] = useState<UpcomingActivity | null>(null);
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);

  if (activities.length === 0) return null;

  function openCheckIn(a: UpcomingActivity) {
    setTarget(a);
    setMode(null);
    setError(null);
    geo.reset();
  }

  function submitCheckIn() {
    if (!target || !mode) return;
    if (mode === "onsite" && !geo.coords) {
      setError("กรุณาขอตำแหน่ง GPS ก่อน");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await checkInActivity(target.id, {
        mode,
        lat: geo.coords?.lat,
        lng: geo.coords?.lng,
      });
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setTarget(null);
      router.refresh();
    });
  }

  function doCheckOut(a: UpcomingActivity) {
    setError(null);
    startTransition(async () => {
      const res = await checkOutActivity(a.id);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function openRoster(a: UpcomingActivity) {
    setRosterFor(a);
    setRoster(null);
    setRosterLoading(true);
    startTransition(async () => {
      const res = await getActivityCheckinRoster(a.id);
      setRosterLoading(false);
      if ("error" in res) {
        setRoster([]);
        return;
      }
      setRoster(res.roster);
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

  const distance = geo.coords ? haversineDistanceMeters(geo.coords.lat, geo.coords.lng, HQ_COORDS.lat, HQ_COORDS.lng) : null;
  const outsideRadius = distance !== null && distance > HQ_RADIUS_M;

  const now = new Date();

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <CalendarCheck className="h-4 w-4 text-primary" /> กิจกรรม/การอบรมที่กำลังจะถึง
      </h3>
      {error && <p className="text-xs text-danger">{error}</p>}
      <ul className="flex flex-col gap-2">
        {activities.map((a) => {
          const start = new Date(a.start_at);
          const end = a.end_at ? new Date(a.end_at) : null;
          const beforeStart = now < start;
          const afterEnd = end ? now >= end : false;

          let action: React.ReactNode;
          if (a.checkedOutAt) {
            action = (
              <span className="flex shrink-0 items-center gap-1 text-xs text-primary">
                <CheckCircle2 className="h-3.5 w-3.5" /> เสร็จสิ้น
              </span>
            );
          } else if (a.checkedInAt) {
            action = afterEnd ? (
              <Button type="button" size="sm" variant="outline" className="shrink-0" disabled={isPending} onClick={() => doCheckOut(a)}>
                เช็คเอ้าท์
              </Button>
            ) : (
              <span className="shrink-0 text-xs text-muted-foreground">
                เช็คอินแล้ว · รอถึง {format(end ?? start, "HH:mm")} น. เพื่อเช็คเอ้าท์
              </span>
            );
          } else if (beforeStart) {
            action = (
              <span className="shrink-0 text-xs text-muted-foreground">
                เช็คอินได้ตั้งแต่ {format(start, "HH:mm")} น.
              </span>
            );
          } else {
            action = (
              <Button type="button" size="sm" className="shrink-0" onClick={() => openCheckIn(a)}>
                เช็คอิน
              </Button>
            );
          }

          return (
            <li key={a.id} className="flex flex-col gap-1.5 rounded-lg bg-background px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    {a.is_training && <GraduationCap className="h-3.5 w-3.5 text-primary shrink-0" />}
                    {a.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(start, "d MMM yyyy, HH:mm", { locale: th })}
                    {end && ` – ${format(end, "HH:mm")}`} น.
                    {a.location && ` · ${a.location}`}
                  </span>
                  {(a.organizer || a.instructor) && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      {[a.organizer ? `จัดโดย ${a.organizer}` : null, a.instructor ? `วิทยากร ${a.instructor}` : null].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </div>
                {action}
              </div>
              {canViewRoster && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start gap-1 text-xs text-muted-foreground"
                  onClick={() => openRoster(a)}
                >
                  <Users className="h-3.5 w-3.5" /> ดูรายชื่อผู้เช็คอิน
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {/* Check-in dialog */}
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          {target && (
            <>
              <DialogHeader>
                <DialogTitle>เช็คอิน: {target.title}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> รูปแบบการเข้าร่วม
                </label>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("online")}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      mode === "online" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:bg-muted"
                    )}
                  >
                    <Video className="h-4 w-4 shrink-0" /> ออนไลน์ (Zoom Meeting)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("onsite");
                      geo.request();
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      mode === "onsite" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:bg-muted"
                    )}
                  >
                    <MapPin className="h-4 w-4 shrink-0" /> onsite ที่สำนักงานใหญ่ IRDP
                  </button>
                </div>
              </div>

              {mode === "onsite" && (
                <div className="flex flex-col gap-1.5">
                  <Button type="button" variant="outline" size="sm" onClick={geo.request} disabled={geo.locating} className="self-start">
                    <LocateFixed className="h-3.5 w-3.5" />
                    {geo.locating ? "กำลังขอตำแหน่ง..." : geo.coords ? "ขอตำแหน่งใหม่" : "ขอตำแหน่ง GPS"}
                  </Button>
                  {distance !== null && (
                    <div
                      className={cn(
                        "flex items-center gap-2 rounded-xl px-3 py-2 text-xs",
                        outsideRadius ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
                      )}
                    >
                      {outsideRadius ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                      <span>
                        ห่างจากสำนักงาน {distance} ม. (รัศมี {HQ_RADIUS_M} ม.)
                        {outsideRadius && " — อยู่นอกรัศมี"}
                      </span>
                    </div>
                  )}
                  {geo.geoError && <p className="text-xs text-danger">{geo.geoError}</p>}
                </div>
              )}

              {error && <p className="text-xs text-danger">{error}</p>}
              <DialogFooter>
                <Button
                  type="button"
                  disabled={isPending || !mode || (mode === "onsite" && !geo.coords)}
                  onClick={submitCheckIn}
                >
                  {isPending ? "กำลังเช็คอิน..." : "ยืนยันเช็คอิน"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* hr/admin roster dialog */}
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
                        {format(new Date(r.checkedInAt), "HH:mm", { locale: th })} น.
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
    </div>
  );
}
