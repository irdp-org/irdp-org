"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, User, BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SortableTable, type Column } from "@/components/shared/SortableTable";

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
  const [search, setSearch] = useState("");

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
      <p className="text-xs text-muted-foreground">พบ {filtered.length} รายการ</p>
      {filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">ไม่พบรายชื่อ</p>
      ) : (
        <SortableTable columns={columns} rows={filtered} rowKey={(p) => p.id} />
      )}
    </div>
  );
}
