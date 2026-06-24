"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Eye, EyeOff, Bell, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from "@/app/(app)/admin/announcements/actions";
import type { AdminAnnouncement } from "@/app/(app)/admin/announcements/page";

const CATEGORIES = [
  { value: "news", label: "ข่าวสาร" },
  { value: "event", label: "กิจกรรม" },
  { value: "announcement", label: "ประกาศ" },
  { value: "activity", label: "ประชาสัมพันธ์" },
];

const CATEGORY_COLORS: Record<string, string> = {
  news: "bg-blue-100 text-blue-700",
  event: "bg-green-100 text-green-700",
  announcement: "bg-orange-100 text-orange-700",
  activity: "bg-purple-100 text-purple-700",
};

type FormState = {
  title: string;
  body: string;
  category: string;
  is_published: boolean;
  notify_push: boolean;
};

function empty(): FormState {
  return { title: "", body: "", category: "news", is_published: false, notify_push: false };
}

function AnnouncementForm({
  initial,
  onSave,
  onCancel,
  isPending,
  error,
  submitLabel,
}: {
  initial: FormState;
  onSave: (formData: FormData) => void;
  onCancel: () => void;
  isPending: boolean;
  error: string | null;
  submitLabel: string;
}) {
  const [form, setForm] = useState(initial);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("title", form.title);
    fd.set("body", form.body);
    fd.set("category", form.category);
    if (form.is_published) fd.set("is_published", "1");
    if (form.notify_push) fd.set("notify_push", "1");
    onSave(fd);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{submitLabel}</p>
        <button type="button" onClick={onCancel}><X className="h-4 w-4 text-muted-foreground" /></button>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">หัวข้อ *</label>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
          required placeholder="หัวข้อประกาศ"
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">หมวดหมู่</label>
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">เนื้อหา *</label>
        <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
          required rows={6} placeholder="เนื้อหาประกาศ..."
          className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
      </div>

      {/* Toggles */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-3 py-3">
        <label className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm text-foreground">
            <Eye className="h-4 w-4 text-muted-foreground" /> เผยแพร่ทันที
          </span>
          <button type="button" onClick={() => setForm({ ...form, is_published: !form.is_published })}
            className={`relative w-10 h-5 rounded-full transition-colors ${form.is_published ? "bg-green-500" : "bg-gray-200"}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_published ? "translate-x-5" : ""}`} />
          </button>
        </label>
        <label className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm text-foreground">
            <Bell className="h-4 w-4 text-muted-foreground" /> ส่ง Push Notification
          </span>
          <button type="button" onClick={() => setForm({ ...form, notify_push: !form.notify_push })}
            className={`relative w-10 h-5 rounded-full transition-colors ${form.notify_push ? "bg-primary" : "bg-gray-200"}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.notify_push ? "translate-x-5" : ""}`} />
          </button>
        </label>
        {form.notify_push && !form.is_published && (
          <p className="text-[11px] text-warning">Push จะส่งเฉพาะเมื่อเผยแพร่แล้วเท่านั้น</p>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "กำลังบันทึก..." : submitLabel}
      </Button>
    </form>
  );
}

export function AnnouncementsAdminClient({ announcements }: { announcements: AdminAnnouncement[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editing, setEditing] = useState<AdminAnnouncement | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function handleCreate(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createAnnouncement(fd);
      if (res.error) { setError(res.error); return; }
      setMode("list");
      router.refresh();
    });
  }

  function handleUpdate(fd: FormData) {
    if (!editing) return;
    setError(null);
    startTransition(async () => {
      const res = await updateAnnouncement(editing.id, fd);
      if (res.error) { setError(res.error); return; }
      setMode("list");
      setEditing(null);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteAnnouncement(id);
      setConfirmId(null);
      router.refresh();
    });
  }

  if (mode === "create") {
    return (
      <AnnouncementForm
        initial={empty()}
        onSave={handleCreate}
        onCancel={() => { setMode("list"); setError(null); }}
        isPending={isPending}
        error={error}
        submitLabel="สร้างประกาศ"
      />
    );
  }

  if (mode === "edit" && editing) {
    return (
      <AnnouncementForm
        initial={{
          title: editing.title,
          body: editing.body,
          category: editing.category,
          is_published: editing.is_published,
          notify_push: editing.notify_push,
        }}
        onSave={handleUpdate}
        onCancel={() => { setMode("list"); setEditing(null); setError(null); }}
        isPending={isPending}
        error={error}
        submitLabel="บันทึกการแก้ไข"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <Button onClick={() => setMode("create")} className="w-full gap-2">
        <Plus className="h-4 w-4" /> สร้างประกาศใหม่
      </Button>

      {announcements.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">ยังไม่มีประกาศ</p>
      ) : (
        <div className="flex flex-col gap-3">
          {announcements.map((ann) => (
            <div key={ann.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-white p-4">
              <div className="flex items-start gap-2">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${CATEGORY_COLORS[ann.category] ?? "bg-gray-100 text-gray-600"}`}>
                  {CATEGORIES.find((c) => c.value === ann.category)?.label ?? ann.category}
                </span>
                {ann.is_published ? (
                  <span className="flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium bg-green-100 text-green-700">
                    <Eye className="h-3 w-3" /> เผยแพร่แล้ว
                  </span>
                ) : (
                  <span className="flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-500">
                    <EyeOff className="h-3 w-3" /> ฉบับร่าง
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-foreground line-clamp-2">{ann.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">{ann.body}</p>
              <div className="flex items-center justify-between border-t border-border pt-2">
                <span className="text-[11px] text-muted-foreground">
                  {new Date(ann.created_at).toLocaleDateString("th-TH", {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                </span>
                <div className="flex items-center gap-2">
                  {confirmId === ann.id ? (
                    <>
                      <button onClick={() => handleDelete(ann.id)} disabled={isPending}
                        className="text-xs font-medium text-danger">ยืนยันลบ</button>
                      <button onClick={() => setConfirmId(null)}
                        className="text-xs text-muted-foreground">ยกเลิก</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditing(ann); setMode("edit"); }}
                        className="p-1 text-muted-foreground/60 hover:text-primary">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => setConfirmId(ann.id)}
                        className="p-1 text-muted-foreground/60 hover:text-danger">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
