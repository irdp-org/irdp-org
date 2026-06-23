"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, X, MapPin } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/shell/EmptyState";
import { FieldRequestSheet } from "./FieldRequestSheet";
import { FIELD_TYPE_LABELS_TH, FIELD_STATUS_LABELS_TH } from "@/lib/ot";
import { cancelFieldRequest } from "@/app/(app)/field/actions";
import type { RequestStatusT, AttendanceTypeT } from "@/lib/database.types";

export type OwnFieldRequest = {
  id: string;
  type: AttendanceTypeT;
  location_id: string | null;
  location_name?: string | null;
  work_date: string;
  planned_start: string | null;
  planned_end: string | null;
  ot_hours: number | null;
  status: RequestStatusT;
  reason: string | null;
};

const STATUS_VARIANT: Record<RequestStatusT, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  submitted: "secondary",
  approved: "default",
  rejected: "destructive",
  returned: "destructive",
  cancelled: "outline",
};

export function FieldRequestsClient({
  requests,
  locations,
}: {
  requests: OwnFieldRequest[];
  locations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<OwnFieldRequest | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCancel(id: string) {
    startTransition(async () => {
      await cancelFieldRequest(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        className="self-start"
        onClick={() => {
          setEditing(null);
          setSheetOpen(true);
        }}
      >
        <Plus className="h-4 w-4" /> ยื่นคำขอ
      </Button>

      {requests.length === 0 ? (
        <EmptyState icon={MapPin} title="ยังไม่มีคำขอนอกสถานที่/WFH" />
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.map((r) => {
            const editable = r.status === "draft" || r.status === "returned";
            const cancellable = r.status !== "approved" && r.status !== "cancelled" && r.status !== "rejected";
            return (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <div className="flex flex-col gap-0.5 text-sm">
                  <span className="font-medium text-foreground">
                    {FIELD_TYPE_LABELS_TH[r.type as "offsite" | "wfh"] ?? r.type}
                    {r.location_name ? ` · ${r.location_name}` : ""}
                  </span>
                  <span className="text-muted-foreground">
                    {format(new Date(r.work_date), "d MMM yyyy")}
                    {r.planned_start && r.planned_end && (
                      <>
                        {" "}
                        · {format(new Date(r.planned_start), "HH:mm")}–
                        {format(new Date(r.planned_end), "HH:mm")}
                      </>
                    )}
                    {r.ot_hours ? ` · OT ${r.ot_hours} ชม.` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[r.status]}>{FIELD_STATUS_LABELS_TH[r.status]}</Badge>
                  {editable && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="แก้ไข"
                      onClick={() => {
                        setEditing(r);
                        setSheetOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {cancellable && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" aria-label="ยกเลิก" disabled={isPending}>
                          <X className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>ยกเลิกคำขอนี้?</AlertDialogTitle>
                          <AlertDialogDescription>
                            ยกเลิกแล้วต้องยื่นคำขอใหม่หากต้องการช่วงนี้
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>ปิด</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleCancel(r.id)}>ยกเลิกคำขอ</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <FieldRequestSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        locations={locations}
        existing={
          editing && editing.type !== "ot"
            ? {
                id: editing.id,
                type: editing.type as "offsite" | "wfh",
                location_id: editing.location_id,
                work_date: editing.work_date,
                planned_start: editing.planned_start,
                planned_end: editing.planned_end,
                reason: editing.reason,
              }
            : null
        }
      />
    </div>
  );
}
