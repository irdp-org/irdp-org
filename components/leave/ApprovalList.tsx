"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Check, Undo2, X, Ban, Pencil, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shell/EmptyState";
import { LeaveRequestSheet } from "./LeaveRequestSheet";
import { LEAVE_LABELS_TH, LEAVE_STATUS_LABELS_TH } from "@/lib/leave";
import { decideLeaveRequest, acknowledgeLeaveRequest } from "@/app/(app)/leave/approval-actions";
import { ClipboardList } from "lucide-react";
import type { RoleT, RequestStatusT, LeaveCodeT } from "@/lib/database.types";

export type ApprovalQueueRow = {
  id: string;
  leave_code: LeaveCodeT;
  start_at: string;
  end_at: string;
  hours: number;
  status: RequestStatusT;
  reason: string | null;
  employee: { id: string; full_name: string; department_id: string | null };
  acknowledgements: { actor_id: string; actor_name: string; created_at: string }[];
};

const STATUS_VARIANT: Record<RequestStatusT, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  submitted: "secondary",
  approved: "default",
  rejected: "destructive",
  returned: "destructive",
  cancelled: "outline",
};

function NoteDialog({
  label,
  icon: Icon,
  onConfirm,
  disabled,
}: {
  label: string;
  icon: typeof Check;
  onConfirm: (note: string) => void;
  disabled?: boolean;
}) {
  const [note, setNote] = useState("");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <Icon className="h-4 w-4" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <Textarea
          placeholder="หมายเหตุ (ไม่บังคับ)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <DialogFooter>
          <Button type="button" onClick={() => onConfirm(note)}>
            ยืนยัน{label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ApprovalList({
  rows,
  role,
  currentEmployeeId,
}: {
  rows: ApprovalQueueRow[];
  role: RoleT;
  currentEmployeeId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<ApprovalQueueRow | null>(null);

  function decide(id: string, action: "approve" | "reject" | "return" | "cancel", note?: string) {
    startTransition(async () => {
      await decideLeaveRequest(id, action, note);
      router.refresh();
    });
  }

  function acknowledge(id: string) {
    startTransition(async () => {
      await acknowledgeLeaveRequest(id);
      router.refresh();
    });
  }

  const canApprove = role === "dept_head" || role === "admin";
  const isHr = role === "hr";
  const isExec = role === "exec";

  if (rows.length === 0) {
    return <EmptyState icon={ClipboardList} title="ไม่มีคำขอในรายการนี้" />;
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => {
        const iAcknowledged = r.acknowledgements.some((a) => a.actor_id === currentEmployeeId);
        return (
          <li key={r.id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5 text-sm">
                <span className="font-medium text-foreground">{r.employee.full_name}</span>
                <span className="text-muted-foreground">
                  {LEAVE_LABELS_TH[r.leave_code]} · {format(new Date(r.start_at), "d MMM")} –{" "}
                  {format(new Date(r.end_at), "d MMM yyyy")} · {r.hours} ชม.
                </span>
                {r.reason && <span className="text-muted-foreground">เหตุผล: {r.reason}</span>}
              </div>
              <Badge variant={STATUS_VARIANT[r.status]}>{LEAVE_STATUS_LABELS_TH[r.status]}</Badge>
            </div>

            {r.status === "submitted" && canApprove && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={isPending} onClick={() => decide(r.id, "approve")}>
                  <Check className="h-4 w-4" /> อนุมัติ
                </Button>
                <NoteDialog
                  label="ตีกลับ"
                  icon={Undo2}
                  disabled={isPending}
                  onConfirm={(note) => decide(r.id, "return", note)}
                />
                <NoteDialog
                  label="ปฏิเสธ"
                  icon={X}
                  disabled={isPending}
                  onConfirm={(note) => decide(r.id, "reject", note)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => decide(r.id, "cancel")}
                >
                  <Ban className="h-4 w-4" /> ยกเลิก
                </Button>
              </div>
            )}

            {isHr && r.status !== "cancelled" && (
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(r)}>
                <Pencil className="h-4 w-4" /> แก้ไขวัน-เวลา
              </Button>
            )}

            {isExec && r.status === "approved" && (
              <div className="flex flex-col gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={iAcknowledged ? "outline" : "default"}
                  disabled={isPending || iAcknowledged}
                  onClick={() => acknowledge(r.id)}
                >
                  <ThumbsUp className="h-4 w-4" /> {iAcknowledged ? "รับทราบแล้ว" : "รับทราบ"}
                </Button>
                {r.acknowledgements.length > 0 && (
                  <ul className="text-xs text-muted-foreground">
                    {r.acknowledgements.map((a, i) => (
                      <li key={i}>
                        {a.actor_name} รับทราบเมื่อ {format(new Date(a.created_at), "d MMM yyyy HH:mm")}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        );
      })}

      {editing && (
        <LeaveRequestSheet
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
          existing={{ id: editing.id, leave_code: editing.leave_code, reason: editing.reason }}
        />
      )}
    </ul>
  );
}
