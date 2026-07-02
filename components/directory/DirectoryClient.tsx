"use client";

import { useState, useMemo } from "react";
import { Search, Phone, Mail, Cake } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";

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
  avatarSrc: string | null;
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

export function DirectoryClient({ employees }: { employees: DirectoryEmployee[] }) {
  const [search, setSearch] = useState("");
  const [deptTab, setDeptTab] = useState("ทั้งหมด");

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
    // หัวหน้าฝ่ายขึ้นก่อนเสมอ จากนั้นเรียงตามรหัสพนักงาน
    return [...list].sort((a, b) => {
      const aHead = a.role === "dept_head" ? 0 : 1;
      const bHead = b.role === "dept_head" ? 0 : 1;
      if (aHead !== bHead) return aHead - bHead;
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
            <div
              key={emp.id}
              className={
                emp.role === "dept_head"
                  ? "flex flex-col overflow-hidden rounded-2xl border-2 border-primary bg-primary/5 shadow-md ring-1 ring-primary/20"
                  : "flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
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
                {(emp.role === "dept_head") && (
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
                  <a
                    href={`tel:${emp.phone}`}
                    className="flex items-center gap-1 text-xs text-primary"
                  >
                    <Phone className="h-3 w-3 shrink-0" />
                    {emp.phone}
                  </a>
                )}
                {emp.email && (
                  <a
                    href={`mailto:${emp.email}`}
                    className="flex items-center gap-1 text-xs text-muted-foreground"
                  >
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{emp.email}</span>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
