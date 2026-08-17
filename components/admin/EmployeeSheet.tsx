"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, GraduationCap } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { roleLabelTh } from "@/lib/rbac";
import { createEmployee, updateEmployee, recomputeLeaveBalance } from "@/app/(app)/admin/employees/actions";
import type { RoleT, EducationEntry } from "@/lib/database.types";
import type { EmployeeRow } from "./EmployeeListClient";

const ROLES: RoleT[] = ["employee", "dept_head", "hr", "admin", "exec"];
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function initialsOf(fullName: string) {
  return fullName.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [departmentId, setDepartmentId] = useState(existing?.department_id ?? departments[0]?.id ?? "");
  const [role, setRole] = useState<RoleT>(existing?.role ?? "employee");
  const [status, setStatus] = useState<"active" | "inactive">(
    existing?.status === "inactive" ? "inactive" : "active"
  );
  const [avatarPreview, setAvatarPreview] = useState<string | null>(existing?.avatarUrl ?? null);
  const [education, setEducation] = useState<EducationEntry[]>(existing?.education ?? []);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      setError("ไฟล์รูปใหญ่เกินไป (จำกัด 5MB)");
      e.target.value = "";
      return;
    }
    setError(null);
    setAvatarPreview(URL.createObjectURL(file));
  }

  function addEducation() {
    setEducation((prev) => [...prev, { degree: "", institution: "", year: "" }]);
  }
  function updateEducation(index: number, patch: Partial<EducationEntry>) {
    setEducation((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }
  function removeEducation(index: number) {
    setEducation((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    formData.set("departmentId", departmentId);
    formData.set("role", role);
    formData.set("education", JSON.stringify(education));
    const avatarFile = fileInputRef.current?.files?.[0];
    if (avatarFile) formData.set("avatarFile", avatarFile);
    if (existing) {
      formData.set("status", status);
      // email input is disabled (visual only) — re-inject the value so schema passes
      formData.set("email", existing.email ?? "");
    }

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
          {existing && (
            <div className="flex flex-col items-center gap-2">
              <Avatar className="h-20 w-20">
                {avatarPreview && <AvatarImage src={avatarPreview} alt={existing.full_name} />}
                <AvatarFallback className="text-lg">{initialsOf(existing.full_name)}</AvatarFallback>
              </Avatar>
              <input ref={fileInputRef} type="file" accept="image/*" className="text-sm" onChange={handleAvatarChange} />
            </div>
          )}

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
            <Label>ชื่อเล่น</Label>
            <Input name="nickname" defaultValue={existing?.nickname ?? ""} placeholder="ไม่บังคับ" />
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

          <div className="flex flex-col gap-1.5">
            <Label>เบอร์โต๊ะ (ภายใน)</Label>
            <Input name="deskPhone" placeholder="เช่น 02-XXX-XXXX ต่อ 101" defaultValue={existing?.desk_phone ?? ""} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>ที่อยู่</Label>
            <Textarea name="address" rows={2} defaultValue={existing?.address ?? ""} />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="flex items-center gap-1.5">
              <GraduationCap className="h-3.5 w-3.5" /> ประวัติการศึกษา
            </Label>
            {education.map((entry, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-xl bg-surface p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">รายการที่ {i + 1}</span>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeEducation(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Input
                  placeholder="วุฒิการศึกษา (เช่น ปริญญาตรี)"
                  value={entry.degree}
                  onChange={(e) => updateEducation(i, { degree: e.target.value })}
                />
                <Input
                  placeholder="สถาบัน"
                  value={entry.institution}
                  onChange={(e) => updateEducation(i, { institution: e.target.value })}
                />
                <Input
                  placeholder="ปีที่จบ"
                  value={entry.year}
                  onChange={(e) => updateEducation(i, { year: e.target.value })}
                />
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={addEducation}>
              <Plus className="h-4 w-4" /> เพิ่มประวัติการศึกษา
            </Button>
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

          <SheetFooter className="flex flex-col gap-2 px-0">
            <Button type="submit" disabled={isPending} className="w-full">
              บันทึก
            </Button>
            {existing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                className="w-full text-xs"
                onClick={() => {
                  startTransition(async () => {
                    const res = await recomputeLeaveBalance(existing.id);
                    if (res && "error" in res) setError(res.error ?? "เกิดข้อผิดพลาด");
                    else { setError(null); router.refresh(); }
                  });
                }}
              >
                คำนวณวันลาพักร้อนใหม่ (ปีนี้)
              </Button>
            )}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
