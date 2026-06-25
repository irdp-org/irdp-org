"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, GraduationCap } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateProfile } from "@/app/(app)/profile/actions";
import type { Employee } from "@/lib/auth";
import type { EducationEntry } from "@/lib/database.types";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function initialsOf(fullName: string) {
  return fullName
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function ProfileForm({
  employee,
  avatarUrl,
  departmentName,
  roleLabel,
}: {
  employee: Employee;
  avatarUrl: string | null;
  departmentName: string;
  roleLabel: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(avatarUrl);
  const [education, setEducation] = useState<EducationEntry[]>(employee.education ?? []);
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
    setError(null);
    const formData = new FormData(formRef.current);
    formData.set("education", JSON.stringify(education));
    const file = fileInputRef.current?.files?.[0];
    if (file) formData.set("avatarFile", file);

    startTransition(async () => {
      const res = await updateProfile(formData);
      if (res && "error" in res && res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4 pb-6">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 pt-4">
          <Avatar className="h-20 w-20">
            {avatarPreview && <AvatarImage src={avatarPreview} alt={employee.full_name} />}
            <AvatarFallback className="text-lg">{initialsOf(employee.full_name)}</AvatarFallback>
          </Avatar>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="text-sm"
            onChange={handleAvatarChange}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ข้อมูลส่วนตัว</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>ชื่อ-นามสกุล</Label>
            <Input name="fullName" defaultValue={employee.full_name} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>ที่อยู่</Label>
            <Textarea name="address" rows={2} defaultValue={employee.address ?? ""} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>วันเกิด</Label>
              <Input type="date" name="birthdate" defaultValue={employee.birthdate ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>เบอร์โทร</Label>
              <Input name="phone" defaultValue={employee.phone ?? ""} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>เบอร์โต๊ะ (ภายใน)</Label>
            <Input name="deskPhone" placeholder="เช่น 02-XXX-XXXX ต่อ 101" defaultValue={employee.desk_phone ?? ""} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="h-4 w-4 text-primary" /> ประวัติการศึกษา
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ข้อมูลการทำงาน (แก้ไขได้ที่หน้าจัดการพนักงานเท่านั้น)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">บทบาท</span>
            <span className="text-foreground">{roleLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">ฝ่าย</span>
            <span className="text-foreground">{departmentName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">วันเริ่มงาน</span>
            <span className="text-foreground">{employee.hire_date ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">สถานะ</span>
            <span className="text-foreground">{employee.status === "active" ? "ใช้งานอยู่" : employee.status}</span>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={isPending}>
        บันทึกข้อมูล
      </Button>
    </form>
  );
}
