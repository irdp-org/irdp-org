"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, Camera, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SortableTable, type Column } from "@/components/shared/SortableTable";
import { addParticipant, updateParticipant, deleteParticipant } from "@/app/(app)/training/courses/actions";

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

type Participant = {
  id: string;
  course_id: string;
  prefix?: string | null;
  first_name: string;
  last_name: string;
  nickname?: string | null;
  position: string | null;
  organization: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  photo_url?: string | null;
};

export function ParticipantsClient({
  courseId,
  batchId,
  participants,
  organizations = [],
}: {
  courseId: string;
  batchId: string;
  participants: Participant[];
  organizations?: string[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Participant | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function applyPhotoFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("รองรับเฉพาะไฟล์รูปภาพ"); return; }
    if (file.size > MAX_PHOTO_BYTES) { setError("ไฟล์รูปใหญ่เกินไป (จำกัด 3MB)"); return; }
    setError(null);
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
    }
    setPhotoPreview(URL.createObjectURL(file));
  }

  function openAdd() {
    setEditing(null);
    setPhotoPreview(null);
    setError(null);
    setShowForm(true);
  }

  function openEdit(p: Participant) {
    setEditing(p);
    setPhotoPreview(p.photo_url ?? null);
    setError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setPhotoPreview(null);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = editing
        ? await updateParticipant(editing.id, courseId, batchId, fd)
        : await addParticipant(courseId, batchId, fd);
      if ("error" in res && res.error) { setError(res.error); return; }
      closeForm();
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteParticipant(id, courseId, batchId);
      setConfirmId(null);
      router.refresh();
    });
  }

  const columns: Column<Participant>[] = [
    {
      key: "photo",
      label: "รูป",
      render: (p) =>
        p.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.photo_url} alt="" className="h-9 w-9 rounded-full object-cover border border-border" />
        ) : (
          <div className="h-9 w-9 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center">
            <User className="h-4 w-4 text-blue-300" />
          </div>
        ),
    },
    {
      key: "name",
      label: "ชื่อ-นามสกุล",
      sortValue: (p) => `${p.first_name} ${p.last_name}`,
      render: (p) => (
        <span className="whitespace-nowrap font-medium text-foreground">
          {p.prefix ? `${p.prefix} ` : ""}{p.first_name} {p.last_name}
          {p.nickname && <span className="font-normal text-muted-foreground"> ({p.nickname})</span>}
        </span>
      ),
    },
    {
      key: "position",
      label: "ตำแหน่ง",
      sortValue: (p) => p.position ?? "",
      render: (p) => <span className="text-foreground">{p.position || "-"}</span>,
    },
    {
      key: "organization",
      label: "หน่วยงาน",
      sortValue: (p) => p.organization ?? "",
      render: (p) => <span className="text-foreground">{p.organization || "-"}</span>,
      className: "max-w-[220px]",
    },
    {
      key: "phone",
      label: "เบอร์โทร",
      sortValue: (p) => p.phone ?? "",
      render: (p) => <span className="whitespace-nowrap text-foreground">{p.phone || "-"}</span>,
    },
    {
      key: "email",
      label: "อีเมล",
      sortValue: (p) => p.email ?? "",
      render: (p) => <span className="text-foreground">{p.email || "-"}</span>,
    },
    {
      key: "note",
      label: "หมายเหตุ",
      sortValue: (p) => p.note ?? "",
      render: (p) => <span className="text-muted-foreground italic">{p.note || "-"}</span>,
    },
    {
      key: "actions",
      label: "จัดการ",
      render: (p) => (
        <div className="flex shrink-0 items-center gap-1">
          {confirmId === p.id ? (
            <>
              <Button size="sm" variant="ghost" className="text-danger" disabled={isPending} onClick={() => handleDelete(p.id)}>
                ยืนยัน
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                ยกเลิก
              </Button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => openEdit(p)} className="rounded p-1 text-muted-foreground hover:text-blue-600 hover:bg-blue-50">
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setConfirmId(p.id)} className="rounded p-1 text-muted-foreground hover:text-danger hover:bg-danger/10">
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Add button */}
      {!showForm && (
        <Button type="button" variant="outline" className="gap-2 self-start border-blue-200 text-blue-600 hover:bg-blue-50" onClick={openAdd}>
          <Plus className="h-4 w-4" /> เพิ่มผู้เข้าอบรม
        </Button>
      )}

      {/* Inline add/edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-blue-200 bg-blue-50/50 px-4 py-4 flex flex-col gap-3">
          <p className="text-sm font-medium text-blue-700">{editing ? "แก้ไขผู้เข้าอบรม" : "เพิ่มผู้เข้าอบรม"}</p>

          {/* Photo */}
          <div className="flex items-center gap-3">
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview} alt="" className="h-14 w-14 rounded-full object-cover border border-border" />
            ) : (
              <div className="h-14 w-14 rounded-full bg-white border border-blue-100 flex items-center justify-center">
                <Camera className="h-5 w-5 text-blue-300" />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">รูปผู้เข้าอบรม</label>
              <input
                ref={fileInputRef}
                name="photoFile"
                type="file"
                accept="image/*"
                className="text-xs"
                onChange={(e) => applyPhotoFile(e.target.files?.[0])}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Field name="prefix" label="คำนำหน้า" defaultValue={editing?.prefix ?? ""} />
            <Field name="first_name" label="ชื่อ *" required defaultValue={editing?.first_name ?? ""} />
            <Field name="last_name" label="นามสกุล *" required defaultValue={editing?.last_name ?? ""} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field name="nickname" label="ชื่อเล่น" defaultValue={editing?.nickname ?? ""} />
            <Field name="position" label="ตำแหน่ง" defaultValue={editing?.position ?? ""} />
          </div>
          <Field name="organization" label="หน่วยงาน" list="org-list" defaultValue={editing?.organization ?? ""} />
          <div className="grid grid-cols-2 gap-2">
            <Field name="phone" label="เบอร์โทร" type="tel" defaultValue={editing?.phone ?? ""} />
            <Field name="email" label="อีเมล" type="email" defaultValue={editing?.email ?? ""} />
          </div>
          <Field name="note" label="หมายเหตุ" defaultValue={editing?.note ?? ""} />
          {organizations.length > 0 && (
            <datalist id="org-list">
              {organizations.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending} className="bg-blue-600 hover:bg-blue-700">
              {isPending ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={closeForm}>
              ยกเลิก
            </Button>
          </div>
        </form>
      )}

      {/* Participant table */}
      {participants.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">ยังไม่มีผู้เข้าอบรม</p>
      ) : (
        <SortableTable columns={columns} rows={participants} rowKey={(p) => p.id} />
      )}
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  list,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  list?: string;
  defaultValue?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-foreground">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        list={list}
        defaultValue={defaultValue}
        className="rounded-md border border-input bg-background px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      />
    </div>
  );
}
