"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createOrgEvent, updateOrgEvent, deleteOrgEvent } from "@/app/(app)/calendar/actions";
import type { Database } from "@/lib/database.types";

type CalType = Database["public"]["Enums"]["cal_type_t"];

const TYPE_OPTIONS: { value: CalType; label: string }[] = [
  { value: "holiday", label: "วันหยุดประจำปี" },
  { value: "merit", label: "วันทำบุญ" },
  { value: "meeting", label: "วันประชุม" },
  { value: "activity", label: "กิจกรรมองค์กร" },
];

export type ExistingOrgEvent = {
  id: string;
  title: string;
  description: string | null;
  type: CalType;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
};

export function EventSheet({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: ExistingOrgEvent | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [allDay, setAllDay] = useState(existing?.all_day ?? true);
  const [type, setType] = useState<CalType>(existing?.type ?? "holiday");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toDateInput(iso?: string | null) {
    return iso ? iso.slice(0, 10) : "";
  }
  function toTimeInput(iso?: string | null) {
    return iso ? iso.slice(11, 16) : "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    formData.set("allDay", String(allDay));

    startTransition(async () => {
      const action = existing ? updateOrgEvent.bind(null, existing.id) : createOrgEvent;
      const res = await action(formData);
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!existing) return;
    startTransition(async () => {
      await deleteOrgEvent(existing.id);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{existing ? "แก้ไขกิจกรรมองค์กร" : "เพิ่มกิจกรรมองค์กร"}</SheetTitle>
        </SheetHeader>
        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label>ชื่อกิจกรรม</Label>
            <Input name="title" defaultValue={existing?.title} required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>ประเภท</Label>
            <Select value={type} onValueChange={(v) => setType(v as CalType)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Select isn't a native form field — mirror its value for FormData */}
            <input type="hidden" name="type" value={type} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            ทั้งวัน
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>วันที่เริ่ม</Label>
              <Input type="date" name="startDate" defaultValue={toDateInput(existing?.start_at)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>วันที่สิ้นสุด</Label>
              <Input type="date" name="endDate" defaultValue={toDateInput(existing?.end_at)} />
            </div>
          </div>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>เวลาเริ่ม</Label>
                <Input type="time" name="startTime" defaultValue={toTimeInput(existing?.start_at)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>เวลาสิ้นสุด</Label>
                <Input type="time" name="endTime" defaultValue={toTimeInput(existing?.end_at)} />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>รายละเอียด</Label>
            <Textarea name="description" rows={3} defaultValue={existing?.description ?? ""} />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <SheetFooter className="flex-row gap-2 px-0">
            {existing && (
              <Button type="button" variant="outline" disabled={isPending} onClick={handleDelete}>
                ลบ
              </Button>
            )}
            <Button type="submit" disabled={isPending} className="flex-1">
              บันทึก
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
