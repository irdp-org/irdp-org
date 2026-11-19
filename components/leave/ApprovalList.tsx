"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { formatThaiDate, formatThaiDateTime, bkkDateKey } from "@/lib/format-th";
import { Check, Undo2, X, Ban, Pencil, ThumbsUp, AlertTriangle, Trash2, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shell/EmptyState";
import { LeaveRequestSheet } from "./LeaveRequestSheet";
import { LEAVE_LABELS_TH, LEAVE_STATUS_LABELS_TH } from "@/lib/leave";
import {
  decideLeaveRequest,
  acknowledgeLeaveRequest,
  adminCancelApprovedLeave,
  adminDeleteLeaveRequest,
} from "@/app/(app)/leave/approval-actions";
import { LeaveExportPanel } from "./LeaveExportPanel";
import { RequestFilterBar } from "@/components/shared/RequestFilterBar";
import { ApprovalSummary } from "@/components/shared/ApprovalSummary";
import { MY_ACTION_LABELS_TH, type MyApprovalAction, type TrailEntry } from "@/lib/my-approval-actions";
import { ApprovalTrail } from "@/components/shared/ApprovalTrail";
import { splitAttachment, isImageUrl } from "@/lib/attachment-link";
import { FileText } from "lucide-react";
import { ClipboardList } from "lucide-react";
import { GenerateDocButton } from "@/components/booking/GenerateDocButton";
import { generateLeaveDoc } from "@/app/(app)/leave/actions";
import type { RoleT, RequestStatusT, LeaveCodeT } from "@/lib/database.types";

export type ApprovalQueueRow = {
  id: string;
  leave_code: LeaveCodeT;
  start_at: string;
  end_at: string;
  hours: number;
  status: RequestStatusT;
  reason: string | null;
  exported_at: string | null;
  created_at: string;
  /** Signed URL of the uploaded leave certificate, if any. */
  cert_url: string | null;
  /** Everyone's actions on this request, oldest first. */
  trail: TrailEntry[];
  /** Latest thing the signed-in user did on this request (from approvals). */
  myAction: MyApprovalAction | null;
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
          <DialogTitle>ยกเลิกคำขอลาที่อนุมัติแล้ว</DialogTitle>
          <DialogDescription>
            จะลบกิจกรรมในปฏิทินที่ sync ไว้ (รวมถึงใน Google Calendar) ด้วย
          </DialogDescription>
        </DialogHeader>
        {exportedAt && (
          <div className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2.5 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>
              คำขอนี้ถูกส่งออกให้การเงินไปแล้วเมื่อ {formatThaiDate(new Date(exportedAt))} {format(new Date(exportedAt), "HH:mm")} —
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

export function ApprovalList({
  rows,
  role,
  currentEmployeeId,
  departments = [],
}: {
  rows: ApprovalQueueRow[];
  role: RoleT;
  currentEmployeeId: string;
  departments?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<ApprovalQueueRow | null>(null);
  const [detail, setDetail] = useState<ApprovalQueueRow | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [mineFilter, setMineFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortBy, setSortBy] = useState<"created" | "mine" | "date">("created");

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

  /** Dept heads often come back to a pile of pending requests at once —
   * approve everything currently visible (after name/dept filters) in one
   * click instead of one-by-one. Only touches rows actually awaiting this
   * person's approve action (status === "submitted"). */
  function approveAll(ids: string[]) {
    startTransition(async () => {
      await Promise.all(ids.map((id) => decideLeaveRequest(id, "approve")));
      router.refresh();
    });
  }

  /** Same idea for execs, who see every approved leave org-wide and can
   * rack up 100+ pending acknowledgements. */
  function acknowledgeAll(ids: string[]) {
    startTransition(async () => {
      await Promise.all(ids.map((id) => acknowledgeLeaveRequest(id)));
      router.refresh();
    });
  }

  function cancelApproved(id: string, reason: string) {
    startTransition(async () => {
      await adminCancelApprovedLeave(id, reason);
      router.refresh();
    });
  }

  function hardDelete(id: string) {
    startTransition(async () => {
      await adminDeleteLeaveRequest(id);
      router.refresh();
    });
  }

  const canApprove = role === "dept_head" || role === "admin";
  const isHr = role === "hr";
  const isExec = role === "exec";
  const canCancelApproved = role === "admin" || role === "hr";
  const canExport = role === "hr" || role === "admin";

  /** Awaiting this person's own action: approve (dept_head/admin) or
   * acknowledge (exec). Other roles only look, so nothing is theirs. */
  const isWaitingForMe = (r: ApprovalQueueRow) =>
    canApprove
      ? r.status === "submitted"
      : isExec
        ? r.status === "approved" && !r.acknowledgements.some((a) => a.actor_id === currentEmployeeId)
        : false;

  const filtered = rows
    .filter((r) => {
      const needle = nameFilter.trim().toLowerCase();
      if (needle && !r.employee.full_name.toLowerCase().includes(needle) && !(r.reason ?? "").toLowerCase().includes(needle)) return false;
      if (deptFilter !== "all" && r.employee.department_id !== deptFilter) return false;
      if (typeFilter !== "all" && r.leave_code !== typeFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (mineFilter === "waiting" && !isWaitingForMe(r)) return false;
      if (mineFilter === "done" && !r.myAction) return false;
      if (mineFilter === "approved" && !(r.myAction && (r.myAction.action === "approve" || r.myAction.action === "acknowledge"))) return false;
      if (mineFilter === "rejected" && !(r.myAction && ["reject", "return", "cancel"].includes(r.myAction.action))) return false;
      // Overlap, not containment: a multi-day leave that merely crosses the range still shows.
      if (from && bkkDateKey(r.end_at) < from) return false;
      if (to && bkkDateKey(r.start_at) > to) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "mine") return (b.myAction?.created_at ?? "").localeCompare(a.myAction?.created_at ?? "");
      if (sortBy === "date") return b.start_at.localeCompare(a.start_at);
      return 0; // already newest-submitted first from the server
    });

  const filtersActive =
    !!nameFilter || deptFilter !== "all" || typeFilter !== "all" || statusFilter !== "all" || mineFilter !== "all" || !!from || !!to || sortBy !== "created";
  function clearFilters() {
    setNameFilter("");
    setDeptFilter("all");
    setTypeFilter("all");
    setStatusFilter("all");
    setMineFilter("all");
    setFrom("");
    setTo("");
    setSortBy("created");
  }
  const pendingForMe = rows.filter(isWaitingForMe).length;
  const pendingLabel = canApprove ? "รอฉันอนุมัติ" : isExec ? "รอฉันรับทราบ" : "รออนุมัติ (ทั้งหมด)";
  const pendingCount = canApprove || isExec ? pendingForMe : rows.filter((r) => r.status === "submitted").length;

  if (rows.length === 0) {
    return <EmptyState icon={ClipboardList} title="ไม่มีคำขอในรายการนี้" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <ApprovalSummary
        rows={rows.map((r) => ({ requester: r.employee.full_name, my: r.myAction }))}
        pendingLabel={pendingLabel}
        pendingCount={pendingCount}
      />

      <RequestFilterBar
        search={nameFilter}
        onSearch={setNameFilter}
        searchPlaceholder="ค้นหาชื่อพนักงาน / เหตุผล..."
        selects={[
          ...(departments.length > 0
            ? [{ key: "dept", value: deptFilter, onChange: setDeptFilter, allLabel: "ทุกฝ่าย", options: departments.map((d) => ({ value: d.id, label: d.name })) }]
            : []),
          { key: "type", value: typeFilter, onChange: setTypeFilter, allLabel: "ทุกประเภทลา", options: Object.entries(LEAVE_LABELS_TH).map(([value, label]) => ({ value, label })) },
          { key: "status", value: statusFilter, onChange: setStatusFilter, allLabel: "ทุกสถานะ", options: Object.entries(LEAVE_STATUS_LABELS_TH).map(([value, label]) => ({ value, label })) },
          {
            key: "mine",
            value: mineFilter,
            onChange: setMineFilter,
            allLabel: "ทุกรายการ",
            options: [
              ...(canApprove || isExec ? [{ value: "waiting", label: "รอฉันดำเนินการ" }] : []),
              { value: "done", label: "ที่ฉันดำเนินการแล้ว" },
              { value: "approved", label: "ที่ฉันอนุมัติ/รับทราบแล้ว" },
              { value: "rejected", label: "ที่ฉันตีกลับ/ปฏิเสธ" },
            ],
          },
        ]}
        from={from}
        to={to}
        onFrom={setFrom}
        onTo={setTo}
        extra={
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-sm">
            <span className="text-xs text-muted-foreground">เรียง</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="bg-transparent text-sm text-foreground outline-none">
              <option value="created">ยื่นล่าสุด</option>
              <option value="mine">ที่ฉันดำเนินการล่าสุด</option>
              <option value="date">วันที่ลาล่าสุด</option>
            </select>
          </div>
        }
        shown={filtered.length}
        total={rows.length}
        onClear={clearFilters}
        active={filtersActive}
      />
      {canExport && <LeaveExportPanel rows={filtered} />}

      {(() => {
        const pendingApproveIds = canApprove ? filtered.filter((r) => r.status === "submitted").map((r) => r.id) : [];
        const pendingAcknowledgeIds = isExec
          ? filtered.filter((r) => r.status === "approved" && !r.acknowledgements.some((a) => a.actor_id === currentEmployeeId)).map((r) => r.id)
          : [];
        if (pendingApproveIds.length === 0 && pendingAcknowledgeIds.length === 0) return null;
        return (
          <div className="flex flex-wrap gap-2">
            {pendingApproveIds.length > 0 && (
              <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => approveAll(pendingApproveIds)}>
                <Check className="h-4 w-4" /> อนุมัติทั้งหมด ({pendingApproveIds.length})
              </Button>
            )}
            {pendingAcknowledgeIds.length > 0 && (
              <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => acknowledgeAll(pendingAcknowledgeIds)}>
                <Check className="h-4 w-4" /> รับทราบทั้งหมด ({pendingAcknowledgeIds.length})
              </Button>
            )}
          </div>
        );
      })()}

      {filtered.length === 0 && (
        <EmptyState icon={ClipboardList} title="ไม่พบรายการที่ตรงกับตัวกรอง" />
      )}
      <ul className="flex flex-col gap-2">
      {filtered.map((r) => {
        const iAcknowledged = r.acknowledgements.some((a) => a.actor_id === currentEmployeeId);
        return (
          <li key={r.id} className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setDetail(r)}
                onKeyDown={(e) => e.key === "Enter" && setDetail(r)}
                className="flex min-w-0 cursor-pointer flex-col gap-0.5 rounded-lg text-sm hover:opacity-80"
                title="กดเพื่อดูรายละเอียด"
              >
                <span className="font-medium text-foreground">{r.employee.full_name}</span>
                <span className="text-muted-foreground">
                  {LEAVE_LABELS_TH[r.leave_code]} · {formatThaiDate(new Date(r.start_at), { day: "numeric", month: "short" })} –{" "}
                  {formatThaiDate(new Date(r.end_at))} · {r.hours} ชม.
                </span>
                {r.reason && <span className="text-muted-foreground">เหตุผล: {r.reason}</span>}
                <span className="text-xs text-muted-foreground">ยื่นเมื่อ {formatThaiDateTime(r.created_at)}</span>
                {r.myAction && (
                  <span className="text-xs font-medium text-success">
                    คุณ{MY_ACTION_LABELS_TH[r.myAction.action]}เมื่อ {formatThaiDateTime(r.myAction.created_at)}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Badge variant={STATUS_VARIANT[r.status]}>{LEAVE_STATUS_LABELS_TH[r.status]}</Badge>
                <GenerateDocButton id={r.id} generate={generateLeaveDoc} label="ออกใบลา" />
              </div>
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
                        {a.actor_name} รับทราบเมื่อ {formatThaiDate(new Date(a.created_at))} {format(new Date(a.created_at), "HH:mm")}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {canCancelApproved && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" disabled={isPending} className="self-start text-danger hover:text-danger">
                    <Trash className="h-4 w-4" /> ลบรายการนี้
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>ลบคำขอลาถาวร</DialogTitle>
                    <DialogDescription>
                      ลบคำขอลาของ {r.employee.full_name} ({LEAVE_LABELS_TH[r.leave_code]} {r.hours} ชม.) ออกจากระบบถาวร ไม่สามารถกู้คืนได้
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogTrigger asChild><Button variant="outline">ยกเลิก</Button></DialogTrigger>
                    <Button variant="destructive" disabled={isPending} onClick={() => hardDelete(r.id)}>
                      ลบถาวร
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </li>
        );
      })}

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {LEAVE_LABELS_TH[detail.leave_code]} — {detail.employee.full_name}
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3 py-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">สถานะ</span>
                  <Badge variant={STATUS_VARIANT[detail.status]}>{LEAVE_STATUS_LABELS_TH[detail.status]}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">ฝ่าย</span>
                  <span className="text-foreground">
                    {departments.find((d) => d.id === detail.employee.department_id)?.name ?? "—"}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="shrink-0 text-muted-foreground">ช่วงเวลา</span>
                  <span className="text-right text-foreground">
                    {formatThaiDate(new Date(detail.start_at))} {format(new Date(detail.start_at), "HH:mm")} –{" "}
                    {formatThaiDate(new Date(detail.end_at))} {format(new Date(detail.end_at), "HH:mm")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">จำนวน</span>
                  <span className="text-foreground">
                    {detail.hours} ชม. ({(detail.hours / 7.5).toFixed(2)} วัน)
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">ยื่นเมื่อ</span>
                  <span className="text-foreground">{formatThaiDateTime(detail.created_at)}</span>
                </div>
                {(() => {
                  const { text: reasonText, url: embeddedUrl } = splitAttachment(detail.reason);
                  const attachmentUrl = detail.cert_url || embeddedUrl;
                  return (
                    <>
                      {reasonText && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground">เหตุผล / เรื่องที่ลา</span>
                          <span className="text-foreground">{reasonText}</span>
                        </div>
                      )}
                      {attachmentUrl && (
                        <div className="flex flex-col gap-2">
                          <span className="text-muted-foreground">ไฟล์แนบ</span>
                          {isImageUrl(attachmentUrl) ? (
                            <a href={attachmentUrl} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
                              <img src={attachmentUrl} alt="เอกสารแนบ" className="max-h-64 w-full rounded-xl border border-border object-contain" />
                            </a>
                          ) : (
                            <a
                              href={attachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-primary"
                            >
                              <FileText className="h-4 w-4 shrink-0" /> เปิดไฟล์แนบ
                            </a>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
                <ApprovalTrail entries={detail.trail} />
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="text-muted-foreground">ออกใบลา (Google Doc)</span>
                  <GenerateDocButton id={detail.id} generate={generateLeaveDoc} label="ออกใบลา" />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {editing && (
        <LeaveRequestSheet
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
          existing={{ id: editing.id, leave_code: editing.leave_code, reason: editing.reason }}
        />
      )}
    </ul>
    </div>
  );
}
