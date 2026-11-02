"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Plus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { createDar, addQmr, removeQmr } from "@/app/(app)/qms/dar/actions";
import { DOC_TYPE_CODE_LABEL, DAR_STATUS_LABEL, stepRoleLabels } from "@/lib/qms-dar";
import type { QmsDarStep, QmsDocTypeCodeT } from "@/lib/database.types";
import { cn } from "@/lib/utils";

export type DarListRow = {
  id: string;
  dar_no: string | null;
  action_type: string;
  doc_code: string;
  title: string;
  status: string;
  current_step: number;
  steps: QmsDarStep[];
  created_by_name: string;
  created_at: string;
};

type Matrix = {
  process_code: string;
  process_label: string;
  doc_type_code: QmsDocTypeCodeT;
  author_position: string;
  reviewer_position: string;
  approver_position: string;
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-success/10 text-success",
  returned: "bg-danger/10 text-danger",
  cancelled: "bg-muted text-muted-foreground",
};

const ACTION_LABEL: Record<string, string> = { create: "จัดทำใหม่", revise: "แก้ไข", cancel: "ยกเลิก" };

export function DarListClient({
  rows,
  currentEmployeeId,
  isDcc,
  isAdmin,
  matrix,
  departments,
  employeeOptions,
  qmrMembers,
  activeDocuments,
}: {
  rows: DarListRow[];
  currentEmployeeId: string;
  isDcc: boolean;
  isAdmin: boolean;
  matrix: Matrix[];
  departments: { id: string; name: string }[];
  employeeOptions: { id: string; full_name: string; position: string | null }[];
  qmrMembers: { employee_id: string; full_name: string }[];
  activeDocuments: { id: string; doc_code: string; title: string }[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [qmrOpen, setQmrOpen] = useState(false);
  const [onlyMine, setOnlyMine] = useState(true);

  const visibleRows = useMemo(() => {
    if (!onlyMine) return rows;
    return rows.filter((r) => {
      const step = r.steps[r.current_step];
      return r.created_by_name && (step?.employee_id === currentEmployeeId || r.status !== "pending");
    });
  }, [rows, onlyMine, currentEmployeeId]);

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={onlyMine ? "default" : "outline"} onClick={() => setOnlyMine(true)}>
            รอฉัน / ของฉัน
          </Button>
          <Button type="button" size="sm" variant={!onlyMine ? "default" : "outline"} onClick={() => setOnlyMine(false)}>
            ทั้งหมด
          </Button>
        </div>
        <div className="flex gap-2">
          {isDcc && (
            <Button type="button" size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> สร้างใบ DAR
            </Button>
          )}
          {isAdmin && (
            <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={() => setQmrOpen(true)}>
              <Users className="h-4 w-4" /> จัดการ QMR
            </Button>
          )}
        </div>
      </div>

      {visibleRows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-10 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">ไม่พบคำขอ</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <ul className="divide-y divide-border">
            {visibleRows.map((r) => {
              const step = r.steps[r.current_step];
              const isMine = r.status === "pending" && step?.employee_id === currentEmployeeId;
              return (
                <li key={r.id}>
                  <Link href={`/qms/dar/${r.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-surface">
                    <FileText className="h-4 w-4 shrink-0 mt-0.5 text-primary/60" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-mono text-muted-foreground">{r.dar_no ?? r.doc_code}</span>
                        <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-medium", STATUS_BADGE[r.status])}>
                          {DAR_STATUS_LABEL[r.status]}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                          {ACTION_LABEL[r.action_type]}
                        </span>
                        {isMine && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">รอคุณ</span>}
                      </div>
                      <p className="text-sm font-medium text-foreground">{r.title}</p>
                      <p className="text-xs text-muted-foreground">
                        สร้างโดย {r.created_by_name}
                        {r.status === "pending" && step ? ` · รอ${stepRoleLabels(step)}: ${step.full_name_snapshot}` : ""}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {isDcc && (
        <CreateDarDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          matrix={matrix}
          departments={departments}
          employeeOptions={employeeOptions}
          qmrMembers={qmrMembers}
          activeDocuments={activeDocuments}
        />
      )}
      {isAdmin && (
        <QmrManageDialog open={qmrOpen} onOpenChange={setQmrOpen} qmrMembers={qmrMembers} employeeOptions={employeeOptions} />
      )}
    </div>
  );
}

function QmrManageDialog({
  open,
  onOpenChange,
  qmrMembers,
  employeeOptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qmrMembers: { employee_id: string; full_name: string }[];
  employeeOptions: { id: string; full_name: string; position: string | null }[];
}) {
  const router = useRouter();
  const [pickId, setPickId] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!pickId) return;
    startTransition(async () => {
      await addQmr(pickId);
      setPickId("");
      router.refresh();
    });
  }

  function handleRemove(employeeId: string) {
    startTransition(async () => {
      await removeQmr(employeeId);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>จัดการสิทธิ์ QMR</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            ใบ DAR ทุกใบต้องเลือก QMR อย่างน้อย 1 คน (เว้นแต่ติ๊กยกเว้น) — ต้องเพิ่มรายชื่อ QMR ที่นี่ก่อน DCC จึงจะเลือกได้ตอนสร้างใบ DAR
          </p>
          {qmrMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีใครถูกตั้งเป็น QMR</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {qmrMembers.map((m) => (
                <li key={m.employee_id} className="flex items-center justify-between rounded-lg bg-surface px-3 py-1.5 text-sm">
                  {m.full_name}
                  <button type="button" onClick={() => handleRemove(m.employee_id)} disabled={isPending} className="text-muted-foreground/60 hover:text-danger">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Select value={pickId} onValueChange={setPickId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="เลือกพนักงาน" /></SelectTrigger>
              <SelectContent>
                {employeeOptions
                  .filter((e) => !qmrMembers.some((m) => m.employee_id === e.id))
                  .map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button type="button" disabled={!pickId || isPending} onClick={handleAdd}>เพิ่ม</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateDarDialog({
  open,
  onOpenChange,
  matrix,
  departments,
  employeeOptions,
  qmrMembers,
  activeDocuments,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matrix: Matrix[];
  departments: { id: string; name: string }[];
  employeeOptions: { id: string; full_name: string; position: string | null }[];
  qmrMembers: { employee_id: string; full_name: string }[];
  activeDocuments: { id: string; doc_code: string; title: string }[];
}) {
  const router = useRouter();
  const [actionType, setActionType] = useState<"create" | "revise" | "cancel">("create");
  const [targetDocumentId, setTargetDocumentId] = useState("");
  const [docTypeCode, setDocTypeCode] = useState<QmsDocTypeCodeT>("PM");
  const [processCode, setProcessCode] = useState(matrix[0]?.process_code ?? "");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [confidentiality, setConfidentiality] = useState<"public" | "internal" | "confidential">("internal");
  const [authorId, setAuthorId] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [approverId, setApproverId] = useState("");
  const [qmrWaived, setQmrWaived] = useState(false);
  const [qmrId, setQmrId] = useState(qmrMembers[0]?.employee_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const processOptions = useMemo(() => [...new Map(matrix.map((m) => [m.process_code, m.process_label])).entries()], [matrix]);
  const selectedMatrix = matrix.find((m) => m.process_code === processCode && m.doc_type_code === docTypeCode);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("actionType", actionType);
    formData.set("docTypeCode", docTypeCode);
    formData.set("processCode", processCode);
    formData.set("departmentId", departmentId);
    formData.set("confidentiality", confidentiality);
    formData.set("authorId", authorId);
    formData.set("reviewerId", reviewerId);
    formData.set("approverId", approverId);
    formData.set("qmrId", qmrId);
    if (qmrWaived) formData.set("qmrWaived", "on");
    if (targetDocumentId) formData.set("targetDocumentId", targetDocumentId);
    setError(null);
    if (actionType !== "create" && !targetDocumentId) {
      setError("กรุณาเลือกเอกสารที่จะแก้ไข/ยกเลิก");
      return;
    }
    // Vercel's serverless functions cap a request body at ~4.5MB regardless
    // of Next's own server-actions bodySizeLimit setting — a scanned
    // multi-page PDF routinely blows past that, and the failure shows up as
    // a blank "This page couldn't load" instead of a readable error since
    // the platform rejects the connection before our code ever runs. Catch
    // it client-side with an actionable message instead.
    const attachedFile = formData.get("file");
    if (attachedFile instanceof File && attachedFile.size > 4 * 1024 * 1024) {
      setError(
        `ไฟล์ใหญ่เกินไป (${(attachedFile.size / 1024 / 1024).toFixed(1)}MB) ระบบรองรับไม่เกิน 4MB — ลองสแกนที่ความละเอียดต่ำลง หรือบีบอัดไฟล์ PDF ก่อนแนบ`
      );
      return;
    }
    startTransition(async () => {
      const res = await createDar(formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
      if (res?.id) router.push(`/qms/dar/${res.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        // This is a long form — closing it on a stray outside click (e.g.
        // a mis-tap while reaching for a dropdown) would silently discard
        // everything typed so far. Only the X button or Escape close it.
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>สร้างใบคำขอดำเนินการเอกสาร (DAR)</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>ลักษณะคำขอ</Label>
            <Select value={actionType} onValueChange={(v) => { setActionType(v as typeof actionType); setTargetDocumentId(""); }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="create">จัดทำเอกสารใหม่</SelectItem>
                <SelectItem value="revise">แก้ไข/ปรับปรุงเอกสารเดิม</SelectItem>
                <SelectItem value="cancel">ยกเลิกเอกสารเดิม</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {actionType !== "create" && (
            <div className="flex flex-col gap-1.5">
              <Label>เอกสารที่จะ{actionType === "revise" ? "แก้ไข" : "ยกเลิก"} *</Label>
              <Select value={targetDocumentId} onValueChange={setTargetDocumentId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="เลือกเอกสาร" /></SelectTrigger>
                <SelectContent>
                  {activeDocuments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.doc_code} — {d.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>รหัสเอกสาร *</Label>
              <Input
                name="docCode"
                placeholder="เช่น PM-HR-02"
                required
                defaultValue={activeDocuments.find((d) => d.id === targetDocumentId)?.doc_code ?? ""}
                key={targetDocumentId || "new"}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>ประเภท</Label>
              <Select value={docTypeCode} onValueChange={(v) => setDocTypeCode(v as QmsDocTypeCodeT)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(DOC_TYPE_CODE_LABEL) as QmsDocTypeCodeT[]).map((t) => (
                    <SelectItem key={t} value={t}>{DOC_TYPE_CODE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>ชื่อเอกสาร *</Label>
            <Input
              name="title"
              required
              defaultValue={activeDocuments.find((d) => d.id === targetDocumentId)?.title ?? ""}
              key={(targetDocumentId || "new") + "-title"}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>กระบวนการ (SD-DCC-01-01)</Label>
              <Select value={processCode} onValueChange={setProcessCode}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {processOptions.map(([code, label]) => (
                    <SelectItem key={code} value={code}>{label} ({code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>ฝ่ายเจ้าของเอกสาร</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedMatrix && (
            <div className="rounded-xl bg-surface px-3 py-2 text-xs text-muted-foreground">
              ตามตารางสิทธิ์: ผู้จัดทำ = {selectedMatrix.author_position} · ผู้ทบทวน = {selectedMatrix.reviewer_position} · ผู้อนุมัติ = {selectedMatrix.approver_position}
            </div>
          )}

          <EmployeePicker label="ผู้จัดทำ *" value={authorId} onChange={setAuthorId} options={employeeOptions} />
          <EmployeePicker label="ผู้ทบทวน *" value={reviewerId} onChange={setReviewerId} options={employeeOptions} />
          <EmployeePicker label="ผู้อนุมัติ *" value={approverId} onChange={setApproverId} options={employeeOptions} />

          <div className="flex items-center gap-2">
            <input id="qmrWaived" type="checkbox" checked={qmrWaived} onChange={(e) => setQmrWaived(e.target.checked)} className="h-4 w-4 rounded border-input" />
            <Label htmlFor="qmrWaived" className="cursor-pointer">ได้รับการยกเว้นจาก QMR ไม่ต้องผ่านขั้น QMR</Label>
          </div>
          {!qmrWaived && (
            <>
              <EmployeePicker
                label="QMR *"
                value={qmrId}
                onChange={setQmrId}
                options={qmrMembers.map((q) => ({ id: q.employee_id, full_name: q.full_name, position: null }))}
              />
              {qmrMembers.length === 0 && (
                <p className="text-xs text-danger">
                  ยังไม่มีใครถูกตั้งเป็น QMR ในระบบ — ให้ผู้ดูแลระบบไปที่ปุ่ม &ldquo;จัดการ QMR&rdquo; เพื่อเพิ่มก่อน หรือติ๊กยกเว้นด้านบน
                </p>
              )}
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>เหตุผลของการดำเนินการ</Label>
            <Textarea name="reason" rows={2} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>รายละเอียดที่เปลี่ยนแปลง</Label>
            <Textarea name="changeSummary" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>ชั้นความลับ</Label>
              <Select value={confidentiality} onValueChange={(v) => setConfidentiality(v as typeof confidentiality)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">ทั่วไป (Public)</SelectItem>
                  <SelectItem value="internal">ใช้ภายใน (Internal)</SelectItem>
                  <SelectItem value="confidential">ลับ (Confidential)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>วันที่มีผลบังคับใช้ *</Label>
              <Input type="date" name="effectiveDate" required />
            </div>
          </div>
          {actionType !== "cancel" && (
            <div className="flex flex-col gap-1.5">
              <Label>ไฟล์เอกสาร (ยังไม่ลงนาม) *</Label>
              <input
                name="file"
                type="file"
                accept=".pdf,.doc,.docx"
                className="text-sm text-muted-foreground file:mr-2 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:font-medium file:text-primary"
              />
            </div>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>{isPending ? "กำลังสร้าง..." : "ส่งเข้าสายอนุมัติ"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EmployeePicker({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; full_name: string; position: string | null }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full"><SelectValue placeholder="เลือกพนักงาน" /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.full_name}{o.position ? ` — ${o.position}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
