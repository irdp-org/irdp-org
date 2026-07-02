"use client";

import { useState, useMemo } from "react";
import { Plus, Pencil, Users, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shell/EmptyState";
import { EmployeeSheet } from "./EmployeeSheet";
import { roleLabelTh } from "@/lib/rbac";
import type { RoleT, EmployeeStatusT } from "@/lib/database.types";

const STATUS_TABS: { key: "all" | EmployeeStatusT; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "active", label: "ทำงานอยู่" },
  { key: "inactive", label: "ลาออก/ปิด" },
  { key: "pending", label: "รอเชื่อมบัญชี" },
];

export type EmployeeRow = {
  id: string;
  email: string;
  full_name: string;
  nickname?: string | null;
  department_id: string | null;
  role: RoleT;
  position: string | null;
  status: EmployeeStatusT;
  hire_date?: string | null;
  phone?: string | null;
  birthdate?: string | null;
};

export function EmployeeListClient({
  employees,
  departments,
}: {
  employees: EmployeeRow[];
  departments: { id: string; name: string }[];
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | EmployeeStatusT>("all");
  const departmentNameById = new Map(departments.map((d) => [d.id, d.name]));

  const filtered = useMemo(() => {
    let list = employees;
    if (deptFilter !== "all") list = list.filter((e) => e.department_id === deptFilter);
    if (statusFilter !== "all") list = list.filter((e) => e.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.full_name.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q) ||
          (e.nickname?.toLowerCase().includes(q)) ||
          (e.position?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [employees, deptFilter, statusFilter, search]);

  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        className="self-start"
        onClick={() => {
          setEditing(null);
          setSheetOpen(true);
        }}
      >
        <Plus className="h-4 w-4" /> เพิ่มพนักงาน
      </Button>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="ค้นหาชื่อ อีเมล ตำแหน่ง..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Status filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setStatusFilter(t.key)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === t.key
                ? "bg-primary text-primary-foreground"
                : "bg-surface border border-border text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Department filter */}
      <select
        value={deptFilter}
        onChange={(e) => setDeptFilter(e.target.value)}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="all">ทุกฝ่าย</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>

      <p className="text-sm text-muted-foreground">พบ {filtered.length} คน</p>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="ไม่พบพนักงาน" />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((emp) => (
            <li
              key={emp.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
            >
              <div className="flex flex-col gap-0.5 text-sm">
                <span className="font-medium text-foreground">{emp.full_name}</span>
                <span className="text-muted-foreground">
                  {emp.email} · {emp.department_id ? departmentNameById.get(emp.department_id) : "—"} ·{" "}
                  {roleLabelTh[emp.role]}
                  {emp.position ? ` · ${emp.position}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {emp.status === "inactive" && <Badge variant="outline">ปิดการใช้งาน</Badge>}
                {emp.status === "pending" && <Badge variant="secondary">รอเชื่อมบัญชี</Badge>}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="แก้ไข"
                  onClick={() => {
                    setEditing(emp);
                    setSheetOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <EmployeeSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        departments={departments}
        existing={editing}
      />
    </div>
  );
}
