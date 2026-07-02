"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { createCourse, updateCourse } from "@/app/(app)/training/courses/actions";

type CourseValues = {
  id: string;
  name_th: string;
  name_en: string | null;
  open_date: string | null;
  close_date: string | null;
  location: string | null;
  training_dates: string | null;
  description: string | null;
  target_group: string | null;
  objectives: string | null;
  logo_url: string | null;
};

export function CourseForm({ existing }: { existing?: CourseValues }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = existing
        ? await updateCourse(existing.id, fd)
        : await createCourse(fd);

      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      const id = "id" in result ? result.id : existing?.id;
      router.push(id ? `/training/courses/${id}` : "/training/courses");
      router.refresh();
    });
  }

  const v = existing;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* ชื่อหลักสูตร */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">
          ชื่อหลักสูตร (ภาษาไทย) <span className="text-danger">*</span>
        </label>
        <input
          name="name_th"
          required
          defaultValue={v?.name_th}
          className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          placeholder="เช่น หลักสูตรการบริหารจัดการองค์กรภาครัฐ"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">ชื่อหลักสูตร (ภาษาอังกฤษ)</label>
        <input
          name="name_en"
          defaultValue={v?.name_en ?? ""}
          className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          placeholder="Public Organization Management"
        />
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">วันเปิดรับสมัคร</label>
          <input
            type="date"
            name="open_date"
            defaultValue={v?.open_date ?? ""}
            className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">วันปิดรับสมัคร</label>
          <input
            type="date"
            name="close_date"
            defaultValue={v?.close_date ?? ""}
            className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">วันที่จัดอบรม</label>
        <input
          name="training_dates"
          defaultValue={v?.training_dates ?? ""}
          className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          placeholder="เช่น 10–12 สิงหาคม 2568"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">สถานที่อบรม</label>
        <input
          name="location"
          defaultValue={v?.location ?? ""}
          className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          placeholder="เช่น โรงแรมเซ็นทารา กรุงเทพ"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">รายละเอียดหลักสูตร</label>
        <textarea
          name="description"
          rows={3}
          defaultValue={v?.description ?? ""}
          className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 resize-none"
          placeholder="อธิบายเนื้อหาหลักสูตร..."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">กลุ่มเป้าหมาย</label>
        <input
          name="target_group"
          defaultValue={v?.target_group ?? ""}
          className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          placeholder="เช่น ผู้บริหารระดับกลาง หน่วยงานภาครัฐ"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">วัตถุประสงค์</label>
        <textarea
          name="objectives"
          rows={3}
          defaultValue={v?.objectives ?? ""}
          className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 resize-none"
          placeholder="เช่น เพื่อพัฒนาทักษะการบริหาร..."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">URL โลโก้หลักสูตร</label>
        <input
          name="logo_url"
          type="url"
          defaultValue={v?.logo_url ?? ""}
          className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          placeholder="https://..."
        />
        <p className="text-xs text-muted-foreground">ใส่ URL รูปโลโก้ (ถ้ามี)</p>
      </div>

      {error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
          ยกเลิก
        </Button>
        <Button type="submit" disabled={isPending} className="bg-blue-600 hover:bg-blue-700 flex-1">
          {isPending ? "กำลังบันทึก..." : existing ? "บันทึกการแก้ไข" : "สร้างหลักสูตร"}
        </Button>
      </div>
    </form>
  );
}
