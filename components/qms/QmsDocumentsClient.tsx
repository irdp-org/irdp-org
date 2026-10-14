"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  ExternalLink,
  Plus,
  History,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { uploadQmsDocument, obsoleteQmsDocument, deleteQmsDocument, addDcc, removeDcc } from "@/app/(app)/qms/actions";
import type { QmsDocTypeT, QmsDocStatusT } from "@/lib/database.types";

export type QmsDocRow = {
  id: string;
  doc_code: string;
  title: string;
  doc_type: QmsDocTypeT;
  department_id: string;
  version: string;
  status: QmsDocStatusT;
  effective_date: string;
  superseded_by: string | null;
  google_file_id: string;
  google_view_url: string;
  file_size_bytes: number | null;
  created_at: string;
};

const DOC_TYPE_LABEL: Record<QmsDocTypeT, string> = {
  manual: "คู่มือคุณภาพ",
  procedure: "ระเบียบปฏิบัติงาน",
  work_instruction: "วิธีปฏิบัติงาน",
  form: "ฟอร์ม",
};

const STATUS_LABEL: Record<QmsDocStatusT, string> = {
  active: "ใช้งาน",
  superseded: "ถูกแทนที่แล้ว",
  obsolete: "ยกเลิกใช้งาน",
};

const STATUS_BADGE: Record<QmsDocStatusT, string> = {
  active: "bg-success/10 text-success",
  superseded: "bg-muted text-muted-foreground",
  obsolete: "bg-danger/10 text-danger",
};

const ALL_TAB = "ทั้งหมด";

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function QmsDocumentsClient({
  docs,
  departments,
  isDcc,
  isAdmin,
  controllers,
  employeeOptions,
}: {
  docs: QmsDocRow[];
  departments: { id: string; name: string }[];
  isDcc: boolean;
  isAdmin: boolean;
  controllers: { employee_id: string; full_name: string }[];
  employeeOptions: { id: string; full_name: string }[];
}) {
  const router = useRouter();
  const [activeDept, setActiveDept] = useState(ALL_TAB);
  const [search, setSearch] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [controllersOpen, setControllersOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const deptNameById = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  const visibleDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs
      .filter((d) => (showHistory ? true : d.status === "active"))
      .filter((d) => activeDept === ALL_TAB || deptNameById.get(d.department_id) === activeDept)
      .filter((d) => !q || d.doc_code.toLowerCase().includes(q) || d.title.toLowerCase().includes(q));
  }, [docs, activeDept, search, showHistory, deptNameById]);

  function handleObsolete(id: string) {
    startTransition(async () => {
      const res = await obsoleteQmsDocument(id);
      if (res?.error) setError(res.error);
      router.refresh();
    });
  }

  function handleDelete(id: string, googleFileId: string) {
    startTransition(async () => {
      const res = await deleteQmsDocument(id, googleFileId);
      if (res?.error) setError(res.error);
      setConfirmDeleteId(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      {isDcc && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" className="gap-1.5" onClick={() => setUploadOpen(true)}>
            <Plus className="h-4 w-4" /> อัปโหลดเอกสารใหม่
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setShowHistory((v) => !v)}
          >
            <History className="h-4 w-4" /> {showHistory ? "ซ่อนประวัติ" : "แสดงประวัติ/ยกเลิกแล้ว"}
          </Button>
          {isAdmin && (
            <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={() => setControllersOpen(true)}>
              <Users className="h-4 w-4" /> จัดการสิทธิ์ DCC
            </Button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap gap-1 border-b border-border">
        {[ALL_TAB, ...departments.map((d) => d.name)].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveDept(tab)}
            className={cn(
              "px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeDept === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหารหัสเอกสาร หรือชื่อเรื่อง..." />

      {visibleDocs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-10 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">ไม่พบเอกสาร</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <ul className="divide-y divide-border">
            {visibleDocs.map((doc) => (
              <li key={doc.id} className="flex items-start gap-3 px-4 py-3">
                <FileText className="h-4 w-4 shrink-0 mt-0.5 text-primary/60" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-mono text-muted-foreground">{doc.doc_code}</span>
                    <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-medium", STATUS_BADGE[doc.status])}>
                      {STATUS_LABEL[doc.status]}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">v{doc.version}</span>
                  </div>
                  <a
                    href={doc.google_view_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-primary"
                  >
                    {doc.title}
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                  </a>
                  <p className="text-xs text-muted-foreground">
                    {DOC_TYPE_LABEL[doc.doc_type]} · {deptNameById.get(doc.department_id) ?? "—"} · มีผลบังคับใช้{" "}
                    {new Date(doc.effective_date).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}
                    {doc.file_size_bytes ? ` · ${formatFileSize(doc.file_size_bytes)}` : ""}
                  </p>
                  {isDcc && doc.status === "active" && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <Button type="button" variant="ghost" size="sm" className="text-xs" disabled={isPending} onClick={() => handleObsolete(doc.id)}>
                        ยกเลิกใช้งาน
                      </Button>
                      {isAdmin &&
                        (confirmDeleteId === doc.id ? (
                          <>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleDelete(doc.id, doc.google_file_id)}
                              className="text-xs font-medium text-danger"
                            >
                              ยืนยันลบ
                            </button>
                            <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-xs text-muted-foreground">
                              ยกเลิก
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(doc.id)}
                            className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-danger"
                          >
                            <Trash2 className="h-3 w-3" /> ลบ
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isDcc && (
        <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} departments={departments} />
      )}
      {isAdmin && (
        <ControllersDialog
          open={controllersOpen}
          onOpenChange={setControllersOpen}
          controllers={controllers}
          employeeOptions={employeeOptions}
        />
      )}
    </div>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  departments,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [docType, setDocType] = useState<QmsDocTypeT>("procedure");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("docType", docType);
    formData.set("departmentId", departmentId);
    setError(null);
    startTransition(async () => {
      const res = await uploadQmsDocument(formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>อัปโหลดเอกสาร QMS</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>รหัสเอกสาร *</Label>
            <Input name="docCode" placeholder="เช่น PM-HR-01" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>ชื่อเอกสาร *</Label>
            <Input name="title" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>ประเภท</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as QmsDocTypeT)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(DOC_TYPE_LABEL) as QmsDocTypeT[]).map((t) => (
                  <SelectItem key={t} value={t}>{DOC_TYPE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>ฝ่ายเจ้าของกระบวนการ</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>เวอร์ชัน *</Label>
              <Input name="version" placeholder="เช่น 1.0" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>วันที่มีผลบังคับใช้ *</Label>
              <Input type="date" name="effectiveDate" required />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>ไฟล์ *</Label>
            <input
              name="file"
              type="file"
              required
              accept=".pdf,.doc,.docx,.xls,.xlsx"
              className="text-sm text-muted-foreground file:mr-2 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:font-medium file:text-primary"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            ถ้ารหัสเอกสารนี้มีเวอร์ชันที่ &ldquo;ใช้งาน&rdquo; อยู่แล้ว ระบบจะเปลี่ยนเวอร์ชันเดิมเป็น &ldquo;ถูกแทนที่แล้ว&rdquo; อัตโนมัติ (ไม่ลบของเดิม)
          </p>
          {error && <p className="text-sm text-danger">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "กำลังอัปโหลด..." : "อัปโหลด"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ControllersDialog({
  open,
  onOpenChange,
  controllers,
  employeeOptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  controllers: { employee_id: string; full_name: string }[];
  employeeOptions: { id: string; full_name: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [isPending, startTransition] = useTransition();

  const availableToAdd = employeeOptions.filter((e) => !controllers.some((c) => c.employee_id === e.id));

  function handleAdd() {
    if (!selected) return;
    startTransition(async () => {
      await addDcc(selected);
      setSelected("");
      router.refresh();
    });
  }

  function handleRemove(employeeId: string) {
    startTransition(async () => {
      await removeDcc(employeeId);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>จัดการสิทธิ์ DCC</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            {controllers.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มี DCC เพิ่มเติม (admin ทุกคนแก้ไขได้อยู่แล้วโดยปริยาย)</p>
            ) : (
              controllers.map((c) => (
                <div key={c.employee_id} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm">
                  <span>{c.full_name}</span>
                  <button type="button" disabled={isPending} onClick={() => handleRemove(c.employee_id)}>
                    <X className="h-4 w-4 text-muted-foreground hover:text-danger" />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="เลือกพนักงาน" /></SelectTrigger>
              <SelectContent>
                {availableToAdd.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" disabled={!selected || isPending} onClick={handleAdd}>
              เพิ่ม
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
