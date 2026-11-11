"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { updateVanBooking } from "@/app/(app)/booking/actions";

type Props = {
  bookingId: string;
  vehicleId: string;
  destination: string | null;
  purpose: string | null;
  startAt: string;
  endAt: string;
};

/** Admin-only: reschedule a van booking's date/time without touching
 * destination/purpose/passengers — those are sent back unchanged via
 * hidden state since updateVanBooking expects the full set of fields. */
export function VanBookingEditDateDialog({ bookingId, vehicleId, destination, purpose, startAt, endAt }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toDateStr = (iso: string) => iso.slice(0, 10);
  const toTimeStr = (iso: string) => new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });

  const [date, setDate] = useState(toDateStr(startAt));
  const [endDate, setEndDate] = useState(toDateStr(endAt));
  const [startTime, setStartTime] = useState(toTimeStr(startAt));
  const [endTime, setEndTime] = useState(toTimeStr(endAt));

  function handleOpenChange(v: boolean) {
    if (v) {
      setDate(toDateStr(startAt));
      setEndDate(toDateStr(endAt));
      setStartTime(toTimeStr(startAt));
      setEndTime(toTimeStr(endAt));
      setError(null);
    }
    setOpen(v);
  }

  function handleSubmit() {
    setError(null);
    const fd = new FormData();
    fd.set("vehicleId", vehicleId);
    fd.set("date", date);
    fd.set("endDate", endDate);
    fd.set("startTime", startTime);
    fd.set("endTime", endTime);
    fd.set("destination", destination ?? "");
    fd.set("purpose", purpose ?? "");

    startTransition(async () => {
      const res = await updateVanBooking(bookingId, fd);
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-primary" onClick={() => handleOpenChange(true)} aria-label="แก้ไขวันเวลา">
        <Pencil className="h-4 w-4" />
      </Button>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>แก้ไขวันเวลาการจองรถ</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>วันที่เริ่ม</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (endDate < e.target.value) setEndDate(e.target.value);
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>เวลาเริ่ม</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>วันที่สิ้นสุด</Label>
              <Input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>เวลาสิ้นสุด</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={() => setOpen(false)}>
            ยกเลิก
          </Button>
          <Button type="button" disabled={isPending} onClick={handleSubmit}>
            {isPending ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
