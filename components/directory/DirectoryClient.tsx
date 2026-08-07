"use client";

import { useState, useMemo } from "react";
import { Search, Phone, Mail, Cake, PhoneCall, CalendarDays, GraduationCap, BadgeCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EducationEntry } from "@/lib/database.types";

export type DirectoryEmployee = {
  id: string;
  full_name: string;
  nickname: string | null;
  department_id: string | null;
  department_name: string;
  position: string | null;
  avatar_url: string | null;
  role: string | null;
  phone: string | null;
  email: string | null;
  birthdate: string | null;
  employee_code: string | null;
  desk_phone: string | null;
  hire_date: string | null;
  education: EducationEntry[];
  avatarSrc: string | null;
};

const ROLE_LABELS_TH: Record<string, string> = {
  exec: "ผู้บริหาร",
  dept_head: "หัวหน้าฝ่าย",
  hr: "ฝ่ายบุคคล",
  admin: "แอดมิน",
  employee: "พนักงาน",
};

const DEPT_TABS = ["ทั้งหมด", "ผู้บริหาร", "ประเมินผล", "วิจัยและพัฒนา", "ฝึกอบรม", "ธุรการ"];

function initials(name: string): string {
  const parts = name.trim().split(" ");
  return parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
}

function birthdayDisplay(birthdate: string | null): string {
  if (!birthdate) return "";
  const d = new Date(birthdate);
  return d.toLocaleDateString("th-TH", { month: "long", day: "numeric" });
}

function fullDateDisplay(date: string | null): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
}

function tenureDisplay(hireDate: string | null): string {
  if (!hireDate) return "";
  const start = new Date(hireDate);
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years <= 0 && months <= 0) return "เพิ่งเริ่มงาน";
  const parts = [];
  if (years > 0) parts.push(`${years} ปี`);
  if (months > 0) parts.push(`${months} เดือน`);
  return parts.join(" ");
}

export function DirectoryClient({ employees }: { employees: DirectoryEmployee[] }) {
  const [search, setSearch] = useState("");
  const [deptTab, setDeptTab] = useState("ทั้งหมด");
  const [selected, setSelected] = useState<DirectoryEmployee | null>(null);

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = { "ทั้งหมด": employees.length };
    for (const tab of DEPT_TABS) {
      if (tab === "ทั้งหมด") continue;
      counts[tab] = employees.filter((e) => e.department_name.includes(tab)).length;
    }
    return counts;
  }, [employees]);

  const filtered = useMemo(() => {
    let list = employees;
    if (deptTab !== "ทั้งหมด") {
      list = list.filter((e) => e.department_name.includes(deptTab));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.full_name.toLowerCase().includes(q) ||
          (e.nickname?.toLowerCase().includes(q)) ||
          (e.position?.toLowerCase().includes(q))
      );
    }
    // ผู้บริหารบนสุด → หัวหน้าฝ่าย → ที่เหลือ (ภายในกลุ่มเรียงตามรหัสพนักงาน)
    const rank = (role: string | null) => (role === "exec" ? 0 : role === "dept_head" ? 1 : 2);
    return [...list].sort((a, b) => {
      const ra = rank(a.role), rb = rank(b.role);
      if (ra !== rb) return ra - rb;
      return (a.employee_code ?? "￿").localeCompare(b.employee_code ?? "￿", "en", { numeric: true });
    });
  }, [employees, deptTab, search]);

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 md:px-6">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="ค้นหาชื่อ ตำแหน่ง..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Dept filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {DEPT_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setDeptTab(tab)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              deptTab === tab
                ? "bg-primary text-primary-foreground"
                : "bg-surface border border-border text-foreground"
            }`}
          >
            {tab} ({deptCounts[tab] ?? 0})
          </button>
        ))}
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">ไม่พบพนักงาน</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {filtered.map((emp) => (
            <button
              type="button"
              key={emp.id}
              onClick={() => setSelected(emp)}
              className={
                emp.role === "exec"
                  ? "flex flex-col overflow-hidden rounded-2xl border-2 border-orange-500 bg-orange-50 text-left shadow-md ring-1 ring-orange-300 transition-transform active:scale-[0.98]"
                  : emp.role === "dept_head"
                  ? "flex flex-col overflow-hidden rounded-2xl border-2 border-primary bg-primary/5 text-left shadow-md ring-1 ring-primary/20 transition-transform active:scale-[0.98]"
                  : "flex flex-col overflow-hidden rounded-2xl border border-border bg-surface text-left shadow-sm transition-transform active:scale-[0.98]"
              }
            >
              {/* Large photo */}
              <div className="relative aspect-square w-full bg-muted">
                {emp.avatarSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={emp.avatarSrc}
                    alt={emp.full_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <span className="text-3xl font-semibold text-muted-foreground">
                      {initials(emp.full_name)}
                    </span>
                  </div>
                )}
                {emp.role === "exec" && (
                  <span className="absolute bottom-2 left-2 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                    ผู้บริหาร
                  </span>
                )}
                {emp.role === "dept_head" && (
                  <span className="absolute bottom-2 left-2 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    หัวหน้าฝ่าย
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="flex flex-col gap-1.5 p-3">
                <p className="truncate text-sm font-semibold text-foreground">
                  {emp.full_name}
                  {emp.nickname && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({emp.nickname})
                    </span>
                  )}
                </p>
                {emp.position && (
                  <p className="truncate text-xs text-muted-foreground">{emp.position}</p>
                )}
                {emp.department_name && (
                  <p className="truncate text-xs text-muted-foreground">ฝ่าย{emp.department_name}</p>
                )}
                {emp.birthdate && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Cake className="h-3 w-3 shrink-0" />
                    {birthdayDisplay(emp.birthdate)}
                  </p>
                )}
                {emp.phone && (
                  <p className="flex items-center gap-1 text-xs text-primary">
                    <Phone className="h-3 w-3 shrink-0" />
                    {emp.phone}
                  </p>
                )}
                {emp.email && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{emp.email}</span>
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="sr-only">{selected.full_name}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                {/* Large photo */}
                <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-muted">
                  {selected.avatarSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selected.avatarSrc}
                      alt={selected.full_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="text-5xl font-semibold text-muted-foreground">
                        {initials(selected.full_name)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Name + role */}
                <div className="flex flex-col gap-1">
                  <p className="text-lg font-semibold text-foreground">
                    {selected.full_name}
                    {selected.nickname && (
                      <span className="ml-1.5 text-sm font-normal text-muted-foreground">({selected.nickname})</span>
                    )}
                  </p>
                  {selected.position && <p className="text-sm text-muted-foreground">{selected.position}</p>}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {selected.department_name && (
                      <span className="rounded-full bg-surface border border-border px-2 py-0.5 text-xs text-foreground">
                        ฝ่าย{selected.department_name}
                      </span>
                    )}
                    {selected.role && ROLE_LABELS_TH[selected.role] && (selected.role === "exec" || selected.role === "dept_head") && (
                      <span
                        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          selected.role === "exec" ? "bg-orange-500 text-white" : "bg-primary/90 text-primary-foreground"
                        }`}
                      >
                        <BadgeCheck className="h-3 w-3" />
                        {ROLE_LABELS_TH[selected.role]}
                      </span>
                    )}
                    {selected.employee_code && (
                      <span className="rounded-full bg-surface border border-border px-2 py-0.5 text-xs text-muted-foreground">
                        {selected.employee_code}
                      </span>
                    )}
                  </div>
                </div>

                {/* Contact */}
                <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 text-sm">
                  {selected.phone && (
                    <a href={`tel:${selected.phone}`} className="flex items-center gap-2 text-primary">
                      <Phone className="h-4 w-4 shrink-0" /> {selected.phone}
                      <span className="text-xs text-muted-foreground">(มือถือ)</span>
                    </a>
                  )}
                  {selected.desk_phone && (
                    <a href={`tel:${selected.desk_phone}`} className="flex items-center gap-2 text-primary">
                      <PhoneCall className="h-4 w-4 shrink-0" /> {selected.desk_phone}
                      <span className="text-xs text-muted-foreground">(เบอร์ตรง)</span>
                    </a>
                  )}
                  {selected.email && (
                    <a href={`mailto:${selected.email}`} className="flex items-center gap-2 text-foreground">
                      <Mail className="h-4 w-4 shrink-0" /> <span className="truncate">{selected.email}</span>
                    </a>
                  )}
                  {selected.birthdate && (
                    <p className="flex items-center gap-2 text-foreground">
                      <Cake className="h-4 w-4 shrink-0" /> วันเกิด {birthdayDisplay(selected.birthdate)}
                    </p>
                  )}
                  {selected.hire_date && (
                    <p className="flex items-center gap-2 text-foreground">
                      <CalendarDays className="h-4 w-4 shrink-0" />
                      เริ่มงาน {fullDateDisplay(selected.hire_date)}
                      <span className="text-xs text-muted-foreground">({tenureDisplay(selected.hire_date)})</span>
                    </p>
                  )}
                </div>

                {/* Education */}
                {selected.education && selected.education.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <GraduationCap className="h-3.5 w-3.5" /> ประวัติการศึกษา
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {selected.education.map((ed, i) => (
                        <li key={i} className="rounded-lg bg-surface px-3 py-2 text-sm text-foreground">
                          <span className="font-medium">{ed.degree}</span>
                          {ed.institution && <span className="text-muted-foreground"> — {ed.institution}</span>}
                          {ed.year && <span className="text-muted-foreground"> ({ed.year})</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
