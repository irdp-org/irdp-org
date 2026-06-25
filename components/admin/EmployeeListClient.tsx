"use client";

import { useState } from "react";
import { Plus, Pencil, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shell/EmptyState";
import { EmployeeSheet } from "./EmployeeSheet";
import { roleLabelTh } from "@/lib/rbac";
import type { RoleT, EmployeeStatusT } from "@/lib/database.types";

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
  const departmentNameById = new Map(departments.map((d) => [d.id, d.name]));

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

      {employees.length === 0 ? (
        <EmptyState icon={Users} title="ยังไม่มีพนักงานในระบบ" />
      ) : (
        <ul className="flex flex-col gap-2">
          {employees.map((emp) => (
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
