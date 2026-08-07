"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCameraBooking, updateCameraBooking } from "@/app/(app)/booking/actions";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: {
    id: string;
    location: string | null;
    purpose: string | null;
    start_at: string;
    end_at: string;
  } | null;
};

function toDateInput(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}
function toTimeInput(iso: string) {
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
}

export function CameraBookingSheet({ open, onOpenChange, existing }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate] = useState(existing ? toDateInput(existing.start_at) : today);
  const [endDate, setEndDate] = useState(existing ? toDateInput(existing.end_at) : today);
  const [startTime, setStartTime] = useState(existing ? toTimeInput(existing.start_at) : "08:30");
  const [endTime, setEndTime] = useState(existing ? toTimeInput(existing.end_at) : "17:00");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [purpose, setPurpose] = useState(existing?.purpose ?? "");

  function reset() {
    setDate(today);
    setEndDate(today);
    setStartTime("08:30");
    setEndTime("17:00");
    setLocation("");
    setPurpose("");
    setFormError(null);
  }

  function handleClose(v: boolean) {
    if (!v && !existing) reset();
    onOpenChange(v);
  }

  function handleSubmit() {
    setFormError(null);
    const fd = new FormData();
    fd.set("date", date);
    fd.set("endDate", endDate);
    fd.set("startTime", startTime);
    fd.set("endTime", endTime);
    fd.set("location", location);
    fd.set("purpose", purpose);

    startTransition(async () => {
      const res = existing ? await updateCameraBooking(existing.id, fd) : await createCameraBooking(fd);
      if (res && "error" in res && res.error) {
        setFormError(res.error);
        return;
      }
      handleClose(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{existing ? "แก้ไขการจองกล้อง" : "จองกล้อง"}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>วันที่เริ่ม</Label>
              <Input
                type="date"
                value={date}
                min={today}
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

          <div className="flex flex-col gap-1.5">
            <Label>สถานที่ใช้งาน</Label>
            <Input
              placeholder="เอาไปใช้ที่ไหน เช่น งานอบรมที่โรงแรม..."
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>งาน / วัตถุประสงค์</Label>
            <Textarea
              rows={2}
              placeholder="ใช้ถ่ายงานอะไร..."
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </div>

          {formError && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{formError}</p>}
        </div>

        <SheetFooter className="flex-row gap-2 px-4 pb-4">
          <Button type="button" variant="outline" className="flex-1" disabled={isPending} onClick={() => handleClose(false)}>
            ยกเลิก
          </Button>
          <Button type="button" className="flex-1" disabled={isPending} onClick={handleSubmit}>
            {isPending ? "กำลังบันทึก..." : existing ? "บันทึก" : "จองกล้อง"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
