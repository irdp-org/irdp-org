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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createAsset, updateAsset } from "@/app/(app)/assets/actions";

export const CATEGORIES = [
  { value: "hardware", label: "ฮาร์ดแวร์" },
  { value: "software", label: "ซอฟต์แวร์" },
  { value: "furniture", label: "เฟอร์นิเจอร์" },
  { value: "vehicle", label: "ยานพาหนะ" },
  { value: "other", label: "อื่นๆ" },
];

export type AssetRow = {
  id: string;
  asset_tag: string;
  category: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial: string | null;
  price: number | null;
  vendor: string | null;
  purchase_date: string | null;
  license_key: string | null;
  license_seats: number | null;
  license_expires_at: string | null;
  status: "in_stock" | "assigned" | "returned" | "broken" | "disposed";
  note: string | null;
  current_holder_id: string | null;
  created_at: string;
  updated_at: string;
  holder: { id: string; full_name: string } | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: AssetRow | null;
};

export function AssetSheet({ open, onOpenChange, existing }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [category, setCategory] = useState(existing?.category ?? "hardware");
  const [autoTag, setAutoTag] = useState(!existing);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isSoftware = category === "software";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    formData.set("category", category);
    formData.set("auto_tag", autoTag ? "true" : "false");

    startTransition(async () => {
      const res = existing
        ? await updateAsset(existing.id, formData)
        : await createAsset(formData);
      if (res && "error" in res) {
        setError(res.error ?? null);
        return;
      }
      setError(null);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{existing ? "แก้ไขทรัพย์สิน" : "เพิ่มทรัพย์สิน"}</SheetTitle>
        </SheetHeader>
        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
          {/* Asset tag */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>รหัสทรัพย์สิน</Label>
              {!existing && (
                <button
                  type="button"
                  className="text-xs text-primary underline"
                  onClick={() => setAutoTag((v) => !v)}
                >
                  {autoTag ? "กำหนดเอง" : "สร้างอัตโนมัติ"}
                </button>
              )}
            </div>
            {autoTag && !existing ? (
              <div className="flex h-10 items-center rounded-lg border border-border bg-surface px-3 text-sm text-muted-foreground">
                IRDP-???? (สร้างอัตโนมัติ)
              </div>
            ) : (
              <Input name="asset_tag" defaultValue={existing?.asset_tag ?? ""} required={!autoTag} />
            )}
          </div>

          {/* Category */}
          <div className="flex flex-col gap-1.5">
            <Label>หมวดหมู่</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Core fields */}
          <div className="flex flex-col gap-1.5">
            <Label>ชื่อทรัพย์สิน *</Label>
            <Input name="name" defaultValue={existing?.name ?? ""} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>ยี่ห้อ</Label>
              <Input name="brand" defaultValue={existing?.brand ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>รุ่น</Label>
              <Input name="model" defaultValue={existing?.model ?? ""} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Serial Number</Label>
            <Input name="serial" defaultValue={existing?.serial ?? ""} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>ราคา (บาท)</Label>
              <Input type="number" step="0.01" min="0" name="price" defaultValue={existing?.price ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>วันที่ซื้อ</Label>
              <Input type="date" name="purchase_date" defaultValue={existing?.purchase_date ?? ""} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>ผู้จำหน่าย / Vendor</Label>
            <Input name="vendor" defaultValue={existing?.vendor ?? ""} />
          </div>

          {/* Software-only fields */}
          {isSoftware && (
            <>
              <div className="rounded-xl border border-border/60 bg-surface/60 p-3 flex flex-col gap-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">ข้อมูลสิทธิ์การใช้งาน (License)</p>
                <div className="flex flex-col gap-1.5">
                  <Label>License Key</Label>
                  <Input name="license_key" defaultValue={existing?.license_key ?? ""} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>จำนวน Seats</Label>
                    <Input type="number" min="1" name="license_seats" defaultValue={existing?.license_seats ?? ""} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>วันหมดอายุ</Label>
                    <Input type="date" name="license_expires_at" defaultValue={existing?.license_expires_at ?? ""} />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Note */}
          <div className="flex flex-col gap-1.5">
            <Label>หมายเหตุ</Label>
            <Textarea name="note" defaultValue={existing?.note ?? ""} rows={2} />
          </div>

          {/* Document upload */}
          <div className="flex flex-col gap-1.5">
            <Label>อัปโหลดเอกสาร (PDF / รูปภาพ)</Label>
            <Input
              type="file"
              name="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              className="cursor-pointer"
            />
            <p className="text-xs text-muted-foreground">สูงสุด 20 MB</p>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <SheetFooter className="px-0">
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
