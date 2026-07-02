"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, FileText, ExternalLink, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shell/EmptyState";
import { uploadAndOcr, saveReceivedDocument } from "@/app/(app)/documents/actions";

export type ReceivedDoc = {
  id: string;
  doc_no: string;
  recipient_name: string | null;
  recipient_emp_id: string | null;
  sender: string | null;
  subject: string | null;
  image_url: string | null;
  received_at: string;
  recipient_display: string | null;
};

type EmployeeOption = { id: string; full_name: string };

type Draft = {
  imageDriveId: string | null;
  imageUrl: string | null;
  recipientName: string;
  recipientEmpId: string;
  sender: string;
  subject: string;
};

export function DocumentIntakeClient({ docs, employees }: { docs: ReceivedDoc[]; employees: EmployeeOption[] }) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setScanning(true);
    const fd = new FormData();
    fd.set("image", file);
    uploadAndOcr(fd)
      .then((res) => {
        if ("error" in res && res.error) {
          setError(res.error);
          return;
        }
        setDraft({
          imageDriveId: res.imageDriveId ?? null,
          imageUrl: res.imageUrl ?? null,
          recipientName: res.recipient ?? "",
          recipientEmpId: res.suggestedEmpId ?? "",
          sender: res.sender ?? "",
          subject: res.subject ?? "",
        });
      })
      .finally(() => setScanning(false));
  }

  function save() {
    if (!draft) return;
    setError(null);
    const fd = new FormData();
    fd.set("recipientName", draft.recipientName);
    fd.set("recipientEmpId", draft.recipientEmpId);
    fd.set("sender", draft.sender);
    fd.set("subject", draft.subject);
    fd.set("imageDriveId", draft.imageDriveId ?? "");
    fd.set("imageUrl", draft.imageUrl ?? "");
    startSave(async () => {
      const res = await saveReceivedDocument(fd);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setDraft(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Camera trigger */}
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 py-8 text-center">
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} disabled={scanning} />
        {scanning ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-foreground">กำลังอ่านหน้าซอง...</p>
          </>
        ) : (
          <>
            <Camera className="h-8 w-8 text-primary" />
            <p className="text-sm font-medium text-foreground">ถ่ายรูป / เลือกรูปหน้าซอง</p>
            <p className="text-xs text-muted-foreground">ระบบจะอ่านผู้รับ/ผู้ส่งและออกเลขลงรับให้</p>
          </>
        )}
      </label>

      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      {/* Recent documents */}
      {docs.length === 0 ? (
        <EmptyState icon={FileText} title="ยังไม่มีเอกสารที่ลงรับ" />
      ) : (
        <ul className="flex flex-col gap-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
              <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                <span className="font-semibold text-foreground">เลขลงรับ {d.doc_no}</span>
                <span className="text-muted-foreground">
                  ถึง {d.recipient_display || "—"}
                  {d.sender ? ` · จาก ${d.sender}` : ""}
                </span>
                {d.subject && <span className="text-xs text-muted-foreground">เรื่อง {d.subject}</span>}
                <span className="text-xs text-muted-foreground">{format(new Date(d.received_at), "d MMM yyyy HH:mm")}</span>
              </div>
              {d.image_url && (
                <a href={d.image_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-primary">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Confirm dialog */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> ตรวจสอบข้อมูลก่อนลงรับ
            </DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="flex flex-col gap-3">
              {draft.imageUrl && (
                <a href={draft.imageUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                  ดูรูปหน้าซองที่อัปโหลด
                </a>
              )}
              <div className="flex flex-col gap-1.5">
                <Label>ผู้รับ (พนักงาน)</Label>
                <select
                  value={draft.recipientEmpId}
                  onChange={(e) => setDraft({ ...draft, recipientEmpId: e.target.value })}
                  className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">— ไม่ระบุ / ไม่ใช่พนักงาน —</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>ชื่อผู้รับ (ตามหน้าซอง)</Label>
                <Input value={draft.recipientName} onChange={(e) => setDraft({ ...draft, recipientName: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>ผู้ส่ง / หน่วยงาน</Label>
                <Input value={draft.sender} onChange={(e) => setDraft({ ...draft, sender: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>เรื่อง</Label>
                <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDraft(null)} disabled={isSaving}>
                  ยกเลิก
                </Button>
                <Button className="flex-1" onClick={save} disabled={isSaving}>
                  {isSaving ? "กำลังบันทึก..." : "ลงรับ + ออกเลข"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
