"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { differenceInCalendarDays } from "date-fns";
import { AlertTriangle } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { leaveRequestSchema, LEAVE_LABELS_TH, type LeaveRequestInput } from "@/lib/leave";
import { previewLeaveHours, createLeaveRequest, updateLeaveRequest } from "@/app/(app)/leave/actions";

type ExistingRequest = {
  id: string;
  leave_code: LeaveRequestInput["leaveCode"];
  reason: string | null;
  returnNote?: string | null;
};

export function LeaveRequestSheet({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: ExistingRequest | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [preview, setPreview] = useState<{ hours: number; available?: number } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<LeaveRequestInput>({
    resolver: zodResolver(leaveRequestSchema),
    defaultValues: {
      leaveCode: existing?.leave_code ?? "vacation",
      dayPart: "full",
      startDate: "",
      endDate: "",
      reason: existing?.reason ?? "",
    },
  });

  const leaveCode = form.watch("leaveCode");
  const dayPart = form.watch("dayPart");
  const startDate = form.watch("startDate");
  const endDate = form.watch("endDate");

  useEffect(() => {
    if (dayPart !== "full" && startDate) {
      form.setValue("endDate", startDate);
    }
  }, [dayPart, startDate, form]);

  useEffect(() => {
    if (!startDate || !endDate || !leaveCode || !dayPart) {
      setPreview(null);
      return;
    }
    const handle = setTimeout(() => {
      previewLeaveHours({ leaveCode, dayPart, startDate, endDate }).then((res) => {
        if ("error" in res && res.error) return;
        setPreview({ hours: res.hours, available: res.balance?.available_hours });
      });
    }, 350);
    return () => clearTimeout(handle);
  }, [leaveCode, dayPart, startDate, endDate]);

  const showCertHint =
    leaveCode === "sick" &&
    dayPart === "full" &&
    startDate &&
    endDate &&
    differenceInCalendarDays(new Date(endDate), new Date(startDate)) + 1 >= 3;

  function submitForm(submit: boolean) {
    form.handleSubmit((values) => {
      setFormError(null);
      const formData = new FormData();
      formData.set("leaveCode", values.leaveCode);
      formData.set("dayPart", values.dayPart);
      formData.set("startDate", values.startDate);
      formData.set("endDate", values.endDate);
      formData.set("reason", values.reason ?? "");
      formData.set("submit", String(submit));
      const file = fileInputRef.current?.files?.[0];
      if (file) formData.set("certFile", file);

      startTransition(async () => {
        const action = existing ? updateLeaveRequest.bind(null, existing.id) : createLeaveRequest;
        const res = await action(formData);
        if (res && "error" in res && res.error) {
          setFormError(res.error);
          return;
        }
        onOpenChange(false);
        form.reset();
        router.refresh();
      });
    })();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{existing ? "แก้ไขคำขอลา" : "ยื่นคำขอลา"}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          {existing?.returnNote && (
            <div className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2.5 text-sm text-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>
                <span className="font-medium">หัวหน้าฝ่ายตีกลับพร้อมหมายเหตุ:</span> {existing.returnNote}
              </span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>ประเภทการลา</Label>
            <Select
              value={leaveCode}
              onValueChange={(v) => form.setValue("leaveCode", v as LeaveRequestInput["leaveCode"])}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(LEAVE_LABELS_TH).map(([code, label]) => (
                  <SelectItem key={code} value={code}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>ระยะเวลา</Label>
            <RadioGroup
              value={dayPart}
              onValueChange={(v) => form.setValue("dayPart", v as LeaveRequestInput["dayPart"])}
              className="flex flex-col gap-2"
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="full" /> เต็มวัน (หลายวันได้)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="half_am" /> ครึ่งวันเช้า (08:30-12:00)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="half_pm" /> ครึ่งวันบ่าย (13:00-17:00)
              </label>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>วันที่เริ่ม</Label>
              <Input type="date" {...form.register("startDate")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>วันที่สิ้นสุด</Label>
              <Input type="date" disabled={dayPart !== "full"} {...form.register("endDate")} />
            </div>
          </div>
          {form.formState.errors.endDate && (
            <p className="text-sm text-danger">{form.formState.errors.endDate.message}</p>
          )}

          {preview && (
            <div className="rounded-xl bg-surface px-3 py-2 text-sm">
              <span className="text-foreground">คิดเป็น {preview.hours} ชั่วโมง</span>
              {preview.available !== undefined && (
                <span className="text-muted-foreground">
                  {" "}
                  — คงเหลือก่อนยื่น {(preview.available / 7.5).toFixed(2)} วัน
                </span>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>เหตุผล</Label>
            <Textarea rows={3} {...form.register("reason")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>แนบไฟล์ (ใบรับรองแพทย์ ฯลฯ)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="text-sm"
            />
            {showCertHint && (
              <p className="flex items-center gap-1.5 text-xs text-warning">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                ลาป่วยตั้งแต่ 3 วันขึ้นไป ควรแนบใบรับรองแพทย์
              </p>
            )}
          </div>

          {formError && <p className="text-sm text-danger">{formError}</p>}
        </div>

        <SheetFooter className="flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            className="flex-1"
            onClick={() => submitForm(false)}
          >
            บันทึกฉบับร่าง
          </Button>
          <Button type="button" disabled={isPending} className="flex-1" onClick={() => submitForm(true)}>
            ยื่นขอ
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
