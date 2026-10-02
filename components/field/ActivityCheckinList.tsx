"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { CalendarCheck, MapPin, CheckCircle2, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { checkInActivity } from "@/app/(app)/field/activity-checkin-actions";

export type UpcomingActivity = {
  id: string;
  title: string;
  start_at: string;
  location: string | null;
  is_training: boolean;
  checkedIn: boolean;
};

export function ActivityCheckinList({ activities }: { activities: UpcomingActivity[] }) {
  const router = useRouter();
  const [target, setTarget] = useState<UpcomingActivity | null>(null);
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (activities.length === 0) return null;

  function openCheckIn(a: UpcomingActivity) {
    setTarget(a);
    setLocation(a.location ?? "");
    setError(null);
  }

  function submit() {
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const res = await checkInActivity(target.id, location);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setTarget(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <CalendarCheck className="h-4 w-4 text-primary" /> กิจกรรม/การอบรมที่กำลังจะถึง
      </h3>
      <ul className="flex flex-col gap-2">
        {activities.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2 text-sm">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                {a.is_training && <GraduationCap className="h-3.5 w-3.5 text-primary shrink-0" />}
                {a.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(a.start_at), "d MMM yyyy, HH:mm", { locale: th })} น.
                {a.location && ` · ${a.location}`}
              </span>
            </div>
            {a.checkedIn ? (
              <span className="flex shrink-0 items-center gap-1 text-xs text-primary">
                <CheckCircle2 className="h-3.5 w-3.5" /> เช็คอินแล้ว
              </span>
            ) : (
              <Button type="button" size="sm" className="shrink-0" onClick={() => openCheckIn(a)}>
                เช็คอิน
              </Button>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          {target && (
            <>
              <DialogHeader>
                <DialogTitle>เช็คอิน: {target.title}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> สถานที่
                </label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="สถานที่จัดกิจกรรม" />
              </div>
              {error && <p className="text-xs text-danger">{error}</p>}
              <DialogFooter>
                <Button type="button" disabled={isPending} onClick={submit}>
                  {isPending ? "กำลังเช็คอิน..." : "ยืนยันเช็คอิน"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
