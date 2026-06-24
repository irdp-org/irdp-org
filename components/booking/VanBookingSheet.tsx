"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createVanBooking } from "@/app/(app)/booking/actions";

export type EmployeeOption = { id: string; full_name: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vehicleId: string;
  employees: EmployeeOption[];
  currentEmployeeId: string;
};

export function VanBookingSheet({ open, onOpenChange, vehicleId, employees, currentEmployeeId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [startTime, setStartTime] = useState("08:30");
  const [endTime, setEndTime] = useState("17:00");
  const [destination, setDestination] = useState("");
  const [purpose, setPurpose] = useState("");
  const [passengerIds, setPassengerIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const filtered = employees.filter(
    (e) =>
      e.id !== currentEmployeeId &&
      e.full_name.toLowerCase().includes(search.toLowerCase())
  );

  function togglePassenger(id: string) {
    setPassengerIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function reset() {
    setDate(today);
    setEndDate(today);
    setStartTime("08:30");
    setEndTime("17:00");
    setDestination("");
    setPurpose("");
    setPassengerIds([]);
    setSearch("");
    setFormError(null);
  }

  function handleClose(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  function handleSubmit() {
    setFormError(null);
    const fd = new FormData();
    fd.set("vehicleId", vehicleId);
    fd.set("date", date);
    fd.set("endDate", endDate);
    fd.set("startTime", startTime);
    fd.set("endTime", endTime);
    fd.set("destination", destination);
    fd.set("purpose", purpose);
    passengerIds.forEach((id) => fd.append("passengerIds", id));

    startTransition(async () => {
      const res = await createVanBooking(fd);
      if (res && "error" in res && res.error) {
        setFormError(res.error);
        return;
      }
      handleClose(false);
      router.refresh();
    });
  }

  const selectedEmployees = employees.filter((e) => passengerIds.includes(e.id));

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>จองรถตู้</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          {/* Date + time */}
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
              <Input
                type="date"
                value={endDate}
                min={date}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>เวลาสิ้นสุด</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>ปลายทาง</Label>
            <Input
              placeholder="เช่น กระทรวงการคลัง, มหาวิทยาลัย..."
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>วัตถุประสงค์ (ไม่บังคับ)</Label>
            <Textarea
              rows={2}
              placeholder="รายละเอียดการเดินทาง..."
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </div>

          {/* Passenger picker */}
          <div className="flex flex-col gap-2">
            <Label>ผู้ร่วมเดินทาง</Label>

            {selectedEmployees.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedEmployees.map((e) => (
                  <span
                    key={e.id}
                    className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
                  >
                    {e.full_name}
                    <button
                      type="button"
                      onClick={() => togglePassenger(e.id)}
                      className="ml-0.5 text-primary/60 hover:text-primary"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="ค้นหาชื่อพนักงาน..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="max-h-40 overflow-y-auto rounded-xl border border-border">
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-center text-sm text-muted-foreground">ไม่พบพนักงาน</p>
              ) : (
                filtered.map((e) => {
                  const checked = passengerIds.includes(e.id);
                  return (
                    <label
                      key={e.id}
                      className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-surface"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePassenger(e.id)}
                        className="accent-primary"
                      />
                      {e.full_name}
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {formError && (
            <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{formError}</p>
          )}
        </div>

        <SheetFooter className="flex-row gap-2 px-4 pb-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={isPending}
            onClick={() => handleClose(false)}
          >
            ยกเลิก
          </Button>
          <Button type="button" className="flex-1" disabled={isPending} onClick={handleSubmit}>
            {isPending ? "กำลังจอง..." : "จองรถตู้"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
