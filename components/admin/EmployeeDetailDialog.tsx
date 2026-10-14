"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { setEmployeeStatus } from "@/app/(app)/admin/employees/actions";
import { roleLabelTh } from "@/lib/rbac";
import type { EmployeeRow } from "./EmployeeListClient";

function initialsOf(fullName: string) {
  return fullName.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

export function EmployeeDetailDialog({
  employee,
  departmentName,
  onOpenChange,
  onEdit,
}: {
  employee: EmployeeRow | null;
  departmentName: string;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleToggleStatus() {
    if (!employee) return;
    const nextStatus = employee.status === "inactive" ? "active" : "inactive";
    startTransition(async () => {
      await setEmployeeStatus(employee.id, nextStatus);
      setConfirmDeactivate(false);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={!!employee} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {employee && (
          <>
            <DialogHeader>
              <DialogTitle className="sr-only">รายละเอียดพนักงาน</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3 pt-2">
              <Avatar className="h-20 w-20">
                {employee.avatarUrl && <AvatarImage src={employee.avatarUrl} alt={employee.full_name} />}
                <AvatarFallback className="text-lg">{initialsOf(employee.full_name)}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-center gap-1 text-center">
                <span className="font-semibold text-foreground">{employee.full_name}</span>
                {employee.employee_code && (
                  <span className="text-xs text-muted-foreground">รหัสพนักงาน {employee.employee_code}</span>
                )}
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline">{roleLabelTh[employee.role]}</Badge>
                  {employee.status === "inactive" && <Badge variant="outline">ปิดการใช้งาน</Badge>}
                  {employee.status === "pending" && <Badge variant="secondary">รอเชื่อมบัญชี</Badge>}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-xl bg-surface p-3 text-sm">
              <Row label="อีเมล" value={employee.email} />
              <Row label="ฝ่าย" value={departmentName} />
              <Row label="ตำแหน่ง" value={employee.position} />
              <Row label="ชื่อเล่น" value={employee.nickname} />
              <Row label="เบอร์โทร" value={employee.phone} />
              <Row label="เบอร์โต๊ะ" value={employee.desk_phone} />
              <Row label="วันเกิด" value={employee.birthdate} />
              <Row label="วันเริ่มงาน" value={employee.hire_date} />
              <Row label="ที่อยู่" value={employee.address} />
            </div>

            <div className="flex items-center justify-center gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1 gap-1.5" onClick={onEdit}>
                <Pencil className="h-4 w-4" /> แก้ไข
              </Button>
              {confirmDeactivate ? (
                <div className="flex flex-1 items-center gap-1.5">
                  <Button type="button" variant="destructive" className="flex-1" disabled={isPending} onClick={handleToggleStatus}>
                    {employee.status === "inactive" ? "ยืนยันเปิดใช้งาน" : "ยืนยันปิดการใช้งาน"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => setConfirmDeactivate(false)}>
                    ยกเลิก
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 gap-1.5 text-danger"
                  onClick={() => setConfirmDeactivate(true)}
                >
                  <Trash2 className="h-4 w-4" /> {employee.status === "inactive" ? "เปิดใช้งาน" : "ลบ"}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate text-right text-foreground">{value || "—"}</span>
    </div>
  );
}
