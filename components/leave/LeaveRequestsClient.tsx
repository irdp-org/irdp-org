"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, X } from "lucide-react";
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
import { LeaveRequestSheet } from "./LeaveRequestSheet";
import { LEAVE_LABELS_TH, LEAVE_STATUS_LABELS_TH } from "@/lib/leave";
import { cancelLeaveRequest } from "@/app/(app)/leave/actions";
import { CalendarDays } from "lucide-react";

export type OwnLeaveRequest = {
  id: string;
  leave_code: "sick" | "personal" | "vacation";
  start_at: string;
  end_at: string;
  hours: number;
  status: "draft" | "submitted" | "approved" | "rejected" | "returned" | "cancelled";
  reason: string | null;
};

const STATUS_VARIANT: Record<OwnLeaveRequest["status"], "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  submitted: "secondary",
  approved: "default",
  rejected: "destructive",
  returned: "destructive",
  cancelled: "outline",
};

export function LeaveRequestsClient({ requests }: { requests: OwnLeaveRequest[] }) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<OwnLeaveRequest | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCancel(id: string) {
    startTransition(async () => {
      await cancelLeaveRequest(id);
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
        <Plus className="h-4 w-4" /> ยื่นคำขอลา
      </Button>

      {requests.length === 0 ? (
        <EmptyState icon={CalendarDays} title="ยังไม่มีคำขอลา" />
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
                  <span className="font-medium text-foreground">{LEAVE_LABELS_TH[r.leave_code]}</span>
                  <span className="text-muted-foreground">
                    {format(new Date(r.start_at), "d MMM")} – {format(new Date(r.end_at), "d MMM yyyy")} ·{" "}
                    {r.hours} ชม.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[r.status]}>{LEAVE_STATUS_LABELS_TH[r.status]}</Badge>
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
                          <AlertDialogTitle>ยกเลิกคำขอลานี้?</AlertDialogTitle>
                          <AlertDialogDescription>
                            ยกเลิกแล้วต้องยื่นคำขอใหม่หากต้องการลาช่วงนี้
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

      <LeaveRequestSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        existing={editing ? { id: editing.id, leave_code: editing.leave_code, reason: editing.reason } : null}
      />
    </div>
  );
}
