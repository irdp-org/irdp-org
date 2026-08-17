"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState, useRef } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createCourse, updateCourse } from "@/app/(app)/training/courses/actions";

const MAX_LOGO_BYTES = 3 * 1024 * 1024;

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
  is_open: boolean;
};

export function CourseForm({ existing }: { existing?: CourseValues }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(existing?.logo_url ?? null);
  const [dragOver, setDragOver] = useState(false);
  const [isOpen, setIsOpen] = useState(existing?.is_open ?? true);

  function applyLogoFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("รองรับเฉพาะไฟล์รูปภาพ");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("ไฟล์โลโก้ใหญ่เกินไป (จำกัด 3MB)");
      return;
    }
    setError(null);
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
    }
    setLogoPreview(URL.createObjectURL(file));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("is_open", isOpen ? "true" : "false");
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
      {/* เปิด/ปิดหลักสูตร */}
      <div className="flex items-center justify-between rounded-lg border border-input bg-surface px-3 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">หลักสูตรนี้เปิดอยู่</p>
          <p className="text-xs text-muted-foreground">ปิดไว้เมื่อยังไม่รับสมัคร/จบไปแล้ว — ระบบอื่นใช้สถานะนี้แสดงผลต่อ</p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className={`relative w-11 h-6 rounded-full transition-colors ${isOpen ? "bg-green-500" : "bg-gray-300"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isOpen ? "translate-x-5" : ""}`} />
        </button>
      </div>

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
        <label className="text-sm font-medium text-foreground">โลโก้หลักสูตร</label>
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            applyLogoFile(e.dataTransfer.files?.[0]);
          }}
          className={`flex cursor-pointer items-center gap-4 rounded-lg border-2 border-dashed px-4 py-4 transition-colors ${
            dragOver ? "border-blue-500 bg-blue-50" : "border-input bg-background hover:bg-surface"
          }`}
        >
          {logoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoPreview} alt="" className="h-16 w-16 rounded-lg object-contain border border-border shrink-0 bg-white" />
          ) : (
            <div className="h-16 w-16 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <ImagePlus className="h-7 w-7 text-blue-400" />
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <p className="text-sm text-foreground">ลากไฟล์มาวาง หรือ คลิกเพื่อเลือกรูป</p>
            <p className="text-xs text-muted-foreground">JPG, PNG, WEBP, SVG — ไม่เกิน 3MB</p>
          </div>
        </div>
        <input
          ref={fileInputRef}
          name="logoFile"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => applyLogoFile(e.target.files?.[0])}
        />
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
