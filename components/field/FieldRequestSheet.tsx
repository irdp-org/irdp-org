"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  fieldRequestSchema,
  FIELD_TYPE_LABELS_TH,
  type FieldRequestInput,
  type OtPreview,
  type WeeklyOtSummary,
} from "@/lib/ot";
import {
  previewOt,
  checkWfhConflict,
  createFieldRequest,
  updateFieldRequest,
} from "@/app/(app)/field/actions";

type ExistingRequest = {
  id: string;
  type: "offsite" | "wfh";
  location_id: string | null;
  work_date: string;
  planned_start: string | null;
  planned_end: string | null;
  reason: string | null;
};

function toTimeInput(iso: string | null) {
  return iso ? iso.slice(11, 16) : "";
}

export function FieldRequestSheet({
  open,
  onOpenChange,
  locations,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: { id: string; name: string }[];
  existing?: ExistingRequest | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [otPreview, setOtPreview] = useState<OtPreview | null>(null);
  const [weeklyPreview, setWeeklyPreview] = useState<WeeklyOtSummary | null>(null);
  const [wfhConflict, setWfhConflict] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<FieldRequestInput>({
    resolver: zodResolver(fieldRequestSchema),
    defaultValues: {
      type: existing?.type ?? "offsite",
      locationId: existing?.location_id ?? locations[0]?.id ?? "",
      workDate: existing?.work_date ?? "",
      plannedStart: toTimeInput(existing?.planned_start ?? null) || "08:30",
      plannedEnd: toTimeInput(existing?.planned_end ?? null) || "17:00",
      reason: existing?.reason ?? "",
    },
  });

  const type = form.watch("type");
  const locationId = form.watch("locationId");
  const workDate = form.watch("workDate");
  const plannedStart = form.watch("plannedStart");
  const plannedEnd = form.watch("plannedEnd");

  useEffect(() => {
    if (!workDate) {
      setWfhConflict(false);
      return;
    }
    if (type !== "offsite") {
      setWfhConflict(false);
      return;
    }
    checkWfhConflict(workDate).then(setWfhConflict);
  }, [type, workDate]);

  useEffect(() => {
    if (type !== "offsite" || !workDate || !plannedStart || !plannedEnd) {
      setOtPreview(null);
      setWeeklyPreview(null);
      return;
    }
    const handle = setTimeout(() => {
      previewOt({ type, locationId, workDate, plannedStart, plannedEnd, reason: undefined }).then(
        (res) => {
          if ("error" in res) return;
          setOtPreview(res.ot);
          setWeeklyPreview(res.weekly);
        }
      );
    }, 350);
    return () => clearTimeout(handle);
  }, [type, locationId, workDate, plannedStart, plannedEnd]);

  function submitForm(submit: boolean) {
    form.handleSubmit((values) => {
      setFormError(null);
      const formData = new FormData();
      formData.set("type", values.type);
      formData.set("locationId", values.locationId ?? "");
      formData.set("workDate", values.workDate);
      formData.set("plannedStart", values.plannedStart ?? "");
      formData.set("plannedEnd", values.plannedEnd ?? "");
      formData.set("reason", values.reason ?? "");
      formData.set("submit", String(submit));

      startTransition(async () => {
        const action = existing ? updateFieldRequest.bind(null, existing.id) : createFieldRequest;
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

  const weeklyTotal = (weeklyPreview?.week_ot_hours ?? 0) + (otPreview?.ot_hours ?? 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{existing ? "แก้ไขคำขอ" : "ยื่นคำขอนอกสถานที่ / WFH"}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label>ประเภท</Label>
            <Select
              value={type}
              onValueChange={(v) => form.setValue("type", v as FieldRequestInput["type"])}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(FIELD_TYPE_LABELS_TH).map(([code, label]) => (
                  <SelectItem key={code} value={code}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type === "offsite" && (
            <div className="flex flex-col gap-1.5">
              <Label>สถานที่</Label>
              <Select value={locationId} onValueChange={(v) => form.setValue("locationId", v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.locationId && (
                <p className="text-sm text-danger">{form.formState.errors.locationId.message}</p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>วันที่</Label>
            <Input type="date" {...form.register("workDate")} />
          </div>

          {wfhConflict && (
            <div className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2.5 text-sm text-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>วันนี้มี WFH ที่อนุมัติแล้ว — ยื่นนอกสถานที่/OT ซ้ำไม่ได้ (ระบบจะปฏิเสธถ้าฝืนยื่น)</span>
            </div>
          )}

          {type === "offsite" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>เวลาเข้างาน</Label>
                  <Input type="time" {...form.register("plannedStart")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>เวลาออกงาน</Label>
                  <Input type="time" {...form.register("plannedEnd")} />
                </div>
              </div>
              {(form.formState.errors.plannedStart || form.formState.errors.plannedEnd) && (
                <p className="text-sm text-danger">
                  {form.formState.errors.plannedStart?.message ??
                    form.formState.errors.plannedEnd?.message}
                </p>
              )}

              {otPreview && (
                <div className="flex flex-col gap-1 rounded-xl bg-surface px-3 py-2 text-sm">
                  {otPreview.ot_hours > 0 ? (
                    <span className="text-foreground">
                      OT โดยประมาณ {otPreview.ot_hours} ชม.
                      {otPreview.x1_5_hours > 0 && ` (×1.5: ${otPreview.x1_5_hours} ชม.)`}
                      {otPreview.x3_hours > 0 && ` (×3: ${otPreview.x3_hours} ชม.)`}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">ไม่มี OT จากช่วงเวลานี้</span>
                  )}
                  {weeklyPreview && (
                    <span
                      className={weeklyTotal > 36 ? "text-danger" : "text-muted-foreground"}
                    >
                      สะสมสัปดาห์นี้ {weeklyPreview.week_ot_hours} ชม. + คำขอนี้ ≈ {weeklyTotal.toFixed(2)} ชม.
                      {weeklyTotal > 36 && " — เกิน 36 ชม./สัปดาห์"}
                    </span>
                  )}
                </div>
              )}
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>เหตุผล</Label>
            <Textarea rows={3} {...form.register("reason")} />
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
