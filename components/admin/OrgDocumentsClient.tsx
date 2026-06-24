"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { FileText, Trash2, Upload, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadOrgDocument, deleteOrgDocument } from "@/app/(app)/admin/documents/actions";
import type { OrgDoc } from "@/app/(app)/admin/documents/page";

const CATEGORIES = [
  { value: "founding", label: "เอกสารจัดตั้ง" },
  { value: "regulation", label: "ระเบียบ" },
  { value: "directive", label: "คำสั่ง" },
  { value: "announcement", label: "ประกาศ" },
  { value: "tax", label: "ภาษี / เลขประจำตัว" },
  { value: "consultant", label: "ที่ปรึกษาไทย" },
  { value: "other", label: "อื่นๆ" },
];

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function OrgDocumentsClient({
  docs,
  categoryLabels,
}: {
  docs: OrgDoc[];
  categoryLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await uploadOrgDocument(formData);
      if (res.error) { setError(res.error); return; }
      formRef.current?.reset();
      setShowForm(false);
      router.refresh();
    });
  }

  function handleDelete(id: string, storagePath: string) {
    startTransition(async () => {
      await deleteOrgDocument(id, storagePath);
      setConfirmId(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* Upload form */}
      {showForm ? (
        <form ref={formRef} onSubmit={handleUpload}
          className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">อัปโหลดเอกสารใหม่</p>
            <button type="button" onClick={() => setShowForm(false)}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">ชื่อเอกสาร *</label>
            <input name="title" required placeholder="เช่น ระเบียบว่าด้วยการทำงาน 2563"
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">หมวดหมู่</label>
            <select name="category" defaultValue="other"
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">คำอธิบายสั้น (ไม่บังคับ)</label>
            <input name="description" placeholder="เช่น ฉบับล่าสุด พ.ศ. 2563"
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">ไฟล์ (PDF/Word/รูปภาพ) *</label>
            <input name="file" type="file" required
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
              className="text-sm text-muted-foreground file:mr-2 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-xs file:font-medium file:text-primary" />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={isPending} className="w-full">
            <Upload className="h-4 w-4" />
            {isPending ? "กำลังอัปโหลด..." : "อัปโหลด"}
          </Button>
        </form>
      ) : (
        <Button onClick={() => setShowForm(true)} variant="outline" className="w-full gap-2">
          <Plus className="h-4 w-4" /> อัปโหลดเอกสารใหม่
        </Button>
      )}

      {/* Document list */}
      {docs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-10 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">ยังไม่มีเอกสาร — อัปโหลดไฟล์แรกได้เลย</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <ul className="divide-y divide-border">
            {docs.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 px-4 py-3">
                <FileText className="h-4 w-4 shrink-0 text-primary/60" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {categoryLabels[doc.category] ?? doc.category}
                    {doc.file_size_bytes ? ` · ${formatFileSize(doc.file_size_bytes)}` : ""}
                  </p>
                  {doc.description && (
                    <p className="text-xs text-muted-foreground/70 truncate">{doc.description}</p>
                  )}
                </div>
                {confirmId === doc.id ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleDelete(doc.id, doc.storage_path)}
                      disabled={isPending}
                      className="text-xs font-medium text-danger">ยืนยัน</button>
                    <button onClick={() => setConfirmId(null)}
                      className="text-xs text-muted-foreground">ยกเลิก</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmId(doc.id)}
                    className="shrink-0 p-1 text-muted-foreground/40 hover:text-danger">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
