"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { roleLabelTh } from "@/lib/rbac";
import { createEmployee, updateEmployee } from "@/app/(app)/admin/employees/actions";
import type { RoleT } from "@/lib/database.types";
import type { EmployeeRow } from "./EmployeeListClient";

const ROLES: RoleT[] = ["employee", "dept_head", "hr", "admin", "exec"];

export function EmployeeSheet({
  open,
  onOpenChange,
  departments,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: { id: string; name: string }[];
  existing?: EmployeeRow | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [departmentId, setDepartmentId] = useState(existing?.department_id ?? departments[0]?.id ?? "");
  const [role, setRole] = useState<RoleT>(existing?.role ?? "employee");
  const [status, setStatus] = useState<"active" | "inactive">(
    existing?.status === "inactive" ? "inactive" : "active"
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    formData.set("departmentId", departmentId);
    formData.set("role", role);
    if (existing) formData.set("status", status);

    startTransition(async () => {
      const action = existing ? updateEmployee.bind(null, existing.id) : createEmployee;
      const res = await action(formData);
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{existing ? "แก้ไขข้อมูลพนักงาน" : "เพิ่มพนักงาน"}</SheetTitle>
        </SheetHeader>
        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex flex-col gap-1.5">
            <Label>อีเมล (@irdp.org)</Label>
            <Input
              type="email"
              name="email"
              defaultValue={existing?.email}
              disabled={!!existing}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>ชื่อ-นามสกุล</Label>
            <Input name="fullName" defaultValue={existing?.full_name} required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>ฝ่าย</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>บทบาท (role)</Label>
            <Select value={role} onValueChange={(v) => setRole(v as RoleT)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{roleLabelTh[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>ตำแหน่ง</Label>
            <Input name="position" defaultValue={existing?.position ?? ""} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>วันเริ่มงาน</Label>
              <Input type="date" name="hireDate" defaultValue={existing?.hire_date ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>เบอร์โทร</Label>
              <Input name="phone" defaultValue={existing?.phone ?? ""} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>วันเกิด</Label>
            <Input type="date" name="birthdate" defaultValue={existing?.birthdate ?? ""} />
          </div>

          {existing && (
            <div className="flex flex-col gap-1.5">
              <Label>สถานะการใช้งาน</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as "active" | "inactive")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">ใช้งานอยู่</SelectItem>
                  <SelectItem value="inactive">ปิดการใช้งาน (ลาออก/พ้นสภาพ)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          <SheetFooter className="px-0">
            <Button type="submit" disabled={isPending} className="w-full">
              บันทึก
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
