"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Check,
  Undo2,
  X,
  Ban,
  Pencil,
  ThumbsUp,
  AlertTriangle,
  Trash2,
  ClipboardList,
  MapPin,
} from "lucide-react";
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
import { FieldRequestSheet } from "./FieldRequestSheet";
import { FIELD_TYPE_LABELS_TH, FIELD_STATUS_LABELS_TH } from "@/lib/ot";
import {
  decideFieldRequest,
  acknowledgeFieldRequest,
  adminCancelApprovedField,
} from "@/app/(app)/field/approval-actions";
import type { RoleT, RequestStatusT, AttendanceTypeT, CheckinKindT } from "@/lib/database.types";

export type FieldCheckinInfo = {
  kind: CheckinKindT;
  happened_at: string;
  distance_m: number | null;
  within_radius: boolean | null;
  selfie_url: string | null;
  photo_url: string | null;
};

export type FieldApprovalQueueRow = {
  id: string;
  type: AttendanceTypeT;
  location_id: string | null;
  location_name: string | null;
  work_date: string;
  planned_start: string | null;
  planned_end: string | null;
  ot_hours: number | null;
  pay_x1_hours: number;
  pay_x15_hours: number;
  pay_x3_hours: number;
  status: RequestStatusT;
  reason: string | null;
  exported_at: string | null;
  employee: { id: string; full_name: string; department_id: string | null };
  acknowledgements: { actor_id: string; actor_name: string; created_at: string }[];
  checkins: FieldCheckinInfo[];
};

const STATUS_VARIANT: Record<RequestStatusT, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  submitted: "secondary",
  approved: "default",
  rejected: "destructive",
  returned: "destructive",
  cancelled: "outline",
};

const CHECKIN_KIND_LABELS_TH: Record<CheckinKindT, string> = {
  in: "เช็คอิน",
  out: "เช็คเอาท์",
  wfh_morning: "เช็คอินเช้า",
  wfh_evening: "เช็คอินเย็น",
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

function CancelApprovedDialog({
  exportedAt,
  onConfirm,
  disabled,
}: {
  exportedAt: string | null;
  onConfirm: (reason: string) => void;
  disabled?: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" disabled={disabled}>
          <Trash2 className="h-4 w-4" /> ยกเลิก (เฉพาะ admin/hr)
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ยกเลิกคำขอที่อนุมัติแล้ว</DialogTitle>
        </DialogHeader>
        {exportedAt && (
          <div className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2.5 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>
              คำขอนี้ถูกส่งออกให้การเงินไปแล้วเมื่อ {format(new Date(exportedAt), "d MMM yyyy HH:mm")} —
              การยกเลิกตอนนี้จะไม่แก้ไขข้อมูลที่ส่งไปแล้วโดยอัตโนมัติ ต้องแจ้งฝ่ายการเงินเอง
            </span>
          </div>
        )}
        <Textarea
          placeholder="เหตุผลที่ยกเลิก (จำเป็นต้องระบุ)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="destructive"
            disabled={!reason.trim()}
            onClick={() => onConfirm(reason)}
          >
            ยืนยันยกเลิก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckinSummary({ checkins }: { checkins: FieldCheckinInfo[] }) {
  if (checkins.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-background px-3 py-2">
      {checkins.map((c, i) => (
        <div key={i} className="flex flex-col gap-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{CHECKIN_KIND_LABELS_TH[c.kind]}</span>
            <span className="text-muted-foreground">{format(new Date(c.happened_at), "d MMM HH:mm")}</span>
            {c.within_radius === false && (
              <Badge variant="destructive" className="gap-1">
                <MapPin className="h-3 w-3" /> นอกรัศมี{c.distance_m != null ? ` (${c.distance_m} ม.)` : ""}
              </Badge>
            )}
          </div>
          {(c.selfie_url || c.photo_url) && (
            <div className="flex gap-2">
              {c.selfie_url && (
                /* eslint-disable-next-line @next/next/no-img-element -- signed URL, short-lived, not worth next/image's static optimization */
                <img src={c.selfie_url} alt="เซลฟี่" className="h-16 w-16 rounded-lg object-cover" />
              )}
              {c.photo_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={c.photo_url} alt="รูปหน้างาน" className="h-16 w-16 rounded-lg object-cover" />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function FieldApprovalList({
  rows,
  role,
  currentEmployeeId,
  locations,
}: {
  rows: FieldApprovalQueueRow[];
  role: RoleT;
  currentEmployeeId: string;
  locations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<FieldApprovalQueueRow | null>(null);

  function decide(id: string, action: "approve" | "reject" | "return" | "cancel", note?: string) {
    startTransition(async () => {
      await decideFieldRequest(id, action, note);
      router.refresh();
    });
  }

  function acknowledge(id: string) {
    startTransition(async () => {
      await acknowledgeFieldRequest(id);
      router.refresh();
    });
  }

  function cancelApproved(id: string, reason: string) {
    startTransition(async () => {
      await adminCancelApprovedField(id, reason);
      router.refresh();
    });
  }

  const canApprove = role === "dept_head" || role === "admin";
  const isHr = role === "hr";
  const isExec = role === "exec";
  const canCancelApproved = role === "admin" || role === "hr";

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
                  {FIELD_TYPE_LABELS_TH[r.type as "offsite" | "wfh"] ?? r.type}
                  {r.location_name ? ` · ${r.location_name}` : ""} ·{" "}
                  {format(new Date(r.work_date), "d MMM yyyy")}
                  {r.planned_start && r.planned_end && (
                    <>
                      {" "}
                      {format(new Date(r.planned_start), "HH:mm")}–{format(new Date(r.planned_end), "HH:mm")}
                    </>
                  )}
                </span>
                {r.ot_hours ? (
                  <span className="text-muted-foreground">
                    OT {r.ot_hours} ชม. (×1: {r.pay_x1_hours} · ×1.5: {r.pay_x15_hours} · ×3: {r.pay_x3_hours})
                  </span>
                ) : null}
                {r.reason && <span className="text-muted-foreground">เหตุผล: {r.reason}</span>}
              </div>
              <Badge variant={STATUS_VARIANT[r.status]}>{FIELD_STATUS_LABELS_TH[r.status]}</Badge>
            </div>

            <CheckinSummary checkins={r.checkins} />

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

            {isHr && r.status !== "cancelled" && r.type !== "ot" && (
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(r)}>
                <Pencil className="h-4 w-4" /> แก้ไขวัน-เวลา
              </Button>
            )}

            {canCancelApproved && r.status === "approved" && (
              <CancelApprovedDialog
                exportedAt={r.exported_at}
                disabled={isPending}
                onConfirm={(reason) => cancelApproved(r.id, reason)}
              />
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
        <FieldRequestSheet
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
          locations={locations}
          existing={{
            id: editing.id,
            type: editing.type as "offsite" | "wfh",
            location_id: editing.location_id,
            work_date: editing.work_date,
            planned_start: editing.planned_start,
            planned_end: editing.planned_end,
            reason: editing.reason,
          }}
        />
      )}
    </ul>
  );
}
