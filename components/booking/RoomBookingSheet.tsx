"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createRoomBooking } from "@/app/(app)/booking/actions";

export type RoomOption = { id: string; name: string; size: string | null };

export const ROOM_EQUIPMENT = [
  "โน้ตบุ๊ค",
  "เครื่องเสียง",
  "ไมโครโฟน",
  "โปรเจกเตอร์",
  "ประชุมออนไลน์",
  "บันทึกวิดีโอ",
  "บันทึกเสียง",
];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rooms: RoomOption[];
  defaultRoomId?: string;
};

export function RoomBookingSheet({ open, onOpenChange, rooms, defaultRoomId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const [roomId, setRoomId] = useState(defaultRoomId ?? rooms[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [title, setTitle] = useState("");
  const [equipment, setEquipment] = useState<string[]>([]);

  function toggleEquip(item: string) {
    setEquipment((prev) => (prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]));
  }

  function reset() {
    setRoomId(defaultRoomId ?? rooms[0]?.id ?? "");
    setDate(today);
    setStartTime("09:00");
    setEndTime("10:00");
    setTitle("");
    setEquipment([]);
    setFormError(null);
  }

  function handleClose(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  function handleSubmit() {
    setFormError(null);
    const fd = new FormData();
    fd.set("roomId", roomId);
    fd.set("date", date);
    fd.set("startTime", startTime);
    fd.set("endTime", endTime);
    fd.set("title", title);
    equipment.forEach((x) => fd.append("equipment", x));

    startTransition(async () => {
      const res = await createRoomBooking(fd);
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
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>จองห้องประชุม</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          {/* Room selector — hidden when room was already chosen from the tab button */}
          {!defaultRoomId && (
            <div className="flex flex-col gap-1.5">
              <Label>ห้องประชุม</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="เลือกห้อง" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                      {r.size === "small" ? " (เล็ก)" : r.size === "large" ? " (ใหญ่)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>วันที่</Label>
            <Input
              type="date"
              value={date}
              min={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>เวลาเริ่ม</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>เวลาสิ้นสุด</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>หัวข้อการประชุม (ไม่บังคับ)</Label>
            <Input
              placeholder="เช่น ประชุมทีมวิจัย, นำเสนองาน..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Equipment (item 8) */}
          <div className="flex flex-col gap-2">
            <Label>อุปกรณ์ที่ใช้ในห้องประชุม</Label>
            <div className="grid grid-cols-2 gap-2">
              {ROOM_EQUIPMENT.map((item) => (
                <label key={item} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={equipment.includes(item)}
                    onChange={() => toggleEquip(item)}
                    className="accent-primary h-4 w-4"
                  />
                  {item}
                </label>
              ))}
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
            {isPending ? "กำลังจอง..." : "จองห้อง"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
