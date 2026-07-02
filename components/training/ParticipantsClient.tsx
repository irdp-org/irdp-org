"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Phone, Mail, Building2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addParticipant, deleteParticipant } from "@/app/(app)/training/courses/actions";

type Participant = {
  id: string;
  course_id: string;
  first_name: string;
  last_name: string;
  position: string | null;
  organization: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
};

export function ParticipantsClient({
  courseId,
  participants,
}: {
  courseId: string;
  participants: Participant[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await addParticipant(courseId, fd);
      if ("error" in res && res.error) { setError(res.error); return; }
      (e.target as HTMLFormElement).reset();
      setShowForm(false);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteParticipant(id, courseId);
      setConfirmId(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Add button */}
      {!showForm && (
        <Button
          type="button"
          variant="outline"
          className="gap-2 self-start border-blue-200 text-blue-600 hover:bg-blue-50"
          onClick={() => setShowForm(true)}
        >
          <Plus className="h-4 w-4" /> เพิ่มผู้เข้าอบรม
        </Button>
      )}

      {/* Inline add form */}
      {showForm && (
        <form
          onSubmit={handleAdd}
          className="rounded-xl border border-blue-200 bg-blue-50/50 px-4 py-4 flex flex-col gap-3"
        >
          <p className="text-sm font-medium text-blue-700">เพิ่มผู้เข้าอบรม</p>
          <div className="grid grid-cols-2 gap-2">
            <Field name="first_name" label="ชื่อ *" required />
            <Field name="last_name" label="นามสกุล *" required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field name="position" label="ตำแหน่ง" />
            <Field name="organization" label="หน่วยงาน" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field name="phone" label="เบอร์โทร" type="tel" />
            <Field name="email" label="อีเมล" type="email" />
          </div>
          <Field name="note" label="หมายเหตุ" />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending} className="bg-blue-600 hover:bg-blue-700">
              {isPending ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => { setShowForm(false); setError(null); }}
            >
              ยกเลิก
            </Button>
          </div>
        </form>
      )}

      {/* Participant list */}
      {participants.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">ยังไม่มีผู้เข้าอบรม</p>
      ) : (
        <div className="flex flex-col gap-2">
          {participants.map((p, idx) => (
            <div
              key={p.id}
              className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3"
            >
              {/* Index badge */}
              <div className="shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center mt-0.5">
                {idx + 1}
              </div>

              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <p className="text-sm font-medium text-foreground">
                  {p.first_name} {p.last_name}
                </p>
                {(p.position || p.organization) && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3 shrink-0" />
                    {[p.position, p.organization].filter(Boolean).join(" · ")}
                  </p>
                )}
                {p.phone && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3 shrink-0" /> {p.phone}
                  </p>
                )}
                {p.email && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3 shrink-0" /> {p.email}
                  </p>
                )}
                {p.note && (
                  <p className="text-xs text-muted-foreground italic">{p.note}</p>
                )}
              </div>

              {/* Delete */}
              <div className="shrink-0 flex gap-1">
                {confirmId === p.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      disabled={isPending}
                      className="rounded p-1 text-danger hover:bg-danger/10"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="rounded p-1 text-muted-foreground hover:bg-border"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(p.id)}
                    className="rounded p-1 text-muted-foreground hover:text-danger hover:bg-danger/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-foreground">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        className="rounded-md border border-input bg-background px-2.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      />
    </div>
  );
}
