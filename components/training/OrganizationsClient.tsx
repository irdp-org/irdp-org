"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, User, BookOpen, Pencil, Trash2, Phone, Mail, Briefcase } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SortableTable, type Column } from "@/components/shared/SortableTable";
import { updateParticipant, deleteParticipant } from "@/app/(app)/training/courses/actions";

export type OrgParticipantRow = {
  id: string;
  prefix: string | null;
  first_name: string;
  last_name: string;
  nickname: string | null;
  position: string | null;
  organization: string | null;
  phone: string | null;
  email: string | null;
  photo_url: string | null;
  course_id: string;
  batch_id: string | null;
  course_name: string;
  batch_no: number | null;
};

export function OrganizationsClient({ rows }: { rows: OrgParticipantRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<OrgParticipantRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const organizations = [...new Set(rows.map((r) => r.organization?.trim()).filter(Boolean) as string[])].sort((a, b) =>
    a.localeCompare(b, "th")
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.first_name.toLowerCase().includes(q) ||
        r.last_name.toLowerCase().includes(q) ||
        (r.organization?.toLowerCase().includes(q)) ||
        (r.position?.toLowerCase().includes(q)) ||
        (r.nickname?.toLowerCase().includes(q))
    );
  }, [rows, search]);

  function openDetail(p: OrgParticipantRow) {
    setDetail(p);
    setEditing(false);
    setConfirmDelete(false);
    setError(null);
  }

  function closeDetail() {
    setDetail(null);
    setEditing(false);
    setConfirmDelete(false);
    setError(null);
  }

  function handleSave(formData: FormData) {
    if (!detail) return;
    setError(null);
    startTransition(async () => {
      const res = await updateParticipant(detail.id, detail.course_id, detail.batch_id ?? "", formData);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      closeDetail();
      router.refresh();
    });
  }

  function handleDelete() {
    if (!detail) return;
    startTransition(async () => {
      await deleteParticipant(detail.id, detail.course_id, detail.batch_id ?? "");
      closeDetail();
      router.refresh();
    });
  }

  const columns: Column<OrgParticipantRow>[] = [
    {
      key: "photo",
      label: "รูป",
      render: (p) =>
        p.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.photo_url} alt="" className="h-8 w-8 rounded-full object-cover border border-border" />
        ) : (
          <div className="h-8 w-8 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center">
            <User className="h-3.5 w-3.5 text-blue-300" />
          </div>
        ),
    },
    {
      key: "organization",
      label: "หน่วยงาน",
      sortValue: (p) => p.organization ?? "",
      render: (p) => <span className="text-foreground">{p.organization || "ไม่ระบุหน่วยงาน"}</span>,
      className: "max-w-[220px]",
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
      key: "course",
      label: "หลักสูตร / รุ่น",
      sortValue: (p) => p.course_name,
      render: (p) => (
        <Link
          href={`/training/courses/${p.course_id}${p.batch_id ? `/batches/${p.batch_id}` : ""}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-blue-600 hover:underline whitespace-nowrap"
        >
          <BookOpen className="h-3.5 w-3.5" />
          {p.course_name}{p.batch_no != null ? ` · รุ่นที่ ${p.batch_no}` : ""}
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="ค้นหาชื่อ หน่วยงาน ตำแหน่ง..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <p className="text-xs text-muted-foreground">พบ {filtered.length} รายการ — คลิกแถวเพื่อดู/แก้ไข/ลบ</p>
      {filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">ไม่พบรายชื่อ</p>
      ) : (
        <SortableTable columns={columns} rows={filtered} rowKey={(p) => p.id} onRowClick={openDetail} />
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && closeDetail()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          {detail && !editing && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {detail.prefix ? `${detail.prefix} ` : ""}{detail.first_name} {detail.last_name}
                  {detail.nickname && <span className="font-normal text-muted-foreground"> ({detail.nickname})</span>}
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-2 text-sm">
                {detail.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={detail.photo_url} alt="" className="h-20 w-20 rounded-full object-cover border border-border self-center" />
                )}
                {detail.position && (
                  <p className="flex items-center gap-1.5 text-foreground"><Briefcase className="h-3.5 w-3.5 text-muted-foreground" /> {detail.position}</p>
                )}
                <p className="flex items-center gap-1.5 text-foreground"><BookOpen className="h-3.5 w-3.5 text-muted-foreground" /> {detail.organization || "ไม่ระบุหน่วยงาน"}</p>
                {detail.phone && <p className="flex items-center gap-1.5 text-foreground"><Phone className="h-3.5 w-3.5 text-muted-foreground" /> {detail.phone}</p>}
                {detail.email && <p className="flex items-center gap-1.5 text-foreground"><Mail className="h-3.5 w-3.5 text-muted-foreground" /> {detail.email}</p>}
                <Link
                  href={`/training/courses/${detail.course_id}${detail.batch_id ? `/batches/${detail.batch_id}` : ""}`}
                  className="flex items-center gap-1.5 text-blue-600 hover:underline w-fit"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  {detail.course_name}{detail.batch_no != null ? ` · รุ่นที่ ${detail.batch_no}` : ""}
                </Link>
              </div>
              <DialogFooter className="flex-row items-center justify-between sm:justify-between">
                {confirmDelete ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">ลบรายชื่อนี้?</span>
                    <button type="button" onClick={handleDelete} disabled={isPending} className="font-medium text-danger">ยืนยัน</button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="text-muted-foreground">ยกเลิก</button>
                  </div>
                ) : (
                  <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs text-danger hover:text-danger" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="h-3.5 w-3.5" /> ลบ
                  </Button>
                )}
                <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" /> แก้ไข
                </Button>
              </DialogFooter>
            </>
          )}

          {detail && editing && (
            <>
              <DialogHeader>
                <DialogTitle>แก้ไขข้อมูลผู้เข้าอบรม</DialogTitle>
              </DialogHeader>
              <form action={handleSave} className="flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">คำนำหน้า</Label>
                    <Input name="prefix" defaultValue={detail.prefix ?? ""} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">ชื่อ *</Label>
                    <Input name="first_name" defaultValue={detail.first_name} required />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">นามสกุล *</Label>
                    <Input name="last_name" defaultValue={detail.last_name} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">ชื่อเล่น</Label>
                    <Input name="nickname" defaultValue={detail.nickname ?? ""} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">ตำแหน่ง</Label>
                    <Input name="position" defaultValue={detail.position ?? ""} />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">หน่วยงาน</Label>
                  <Input name="organization" list="org-list-edit" defaultValue={detail.organization ?? ""} />
                  <datalist id="org-list-edit">
                    {organizations.map((o) => <option key={o} value={o} />)}
                  </datalist>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">เบอร์โทร</Label>
                    <Input name="phone" type="tel" defaultValue={detail.phone ?? ""} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">อีเมล</Label>
                    <Input name="email" type="email" defaultValue={detail.email ?? ""} />
                  </div>
                </div>
                {error && <p className="text-xs text-danger">{error}</p>}
                <DialogFooter>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>ยกเลิก</Button>
                  <Button type="submit" size="sm" disabled={isPending}>{isPending ? "กำลังบันทึก..." : "บันทึก"}</Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
