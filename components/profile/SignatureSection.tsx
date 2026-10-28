"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PenLine, Upload, Eraser, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { updateSignature } from "@/app/(app)/profile/actions";

/** Minimal hand-rolled signature pad — pointer events drawing onto a canvas,
 * exported as a PNG data URL on save. No external signature-pad dependency. */
function SignaturePad({ onSave, isPending }: { onSave: (dataUrl: string) => void; isPending: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  function getCtx() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  }

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = getCtx();
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInk.current = true;
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk.current) return;
    onSave(canvas.toDataURL("image/png"));
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        width={400}
        height={160}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full touch-none rounded-lg border border-input bg-white"
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          <Eraser className="h-3.5 w-3.5" /> ล้าง
        </Button>
        <Button type="button" size="sm" disabled={isPending} onClick={save}>
          <Save className="h-3.5 w-3.5" /> {isPending ? "กำลังบันทึก..." : "บันทึกลายเซ็น"}
        </Button>
      </div>
    </div>
  );
}

export function SignatureSection({ signatureUrl }: { signatureUrl: string | null }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function saveFile() {
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set("signatureFile", file);
    startTransition(async () => {
      const res = await updateSignature(fd);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setFile(null);
      router.refresh();
    });
  }

  function saveDrawn(dataUrl: string) {
    setError(null);
    const fd = new FormData();
    fd.set("signatureDataUrl", dataUrl);
    startTransition(async () => {
      const res = await updateSignature(fd);
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-foreground">ลายเซ็นอิเล็กทรอนิกส์</h3>
      <p className="text-xs text-muted-foreground">ใช้แนบในเอกสารอัตโนมัติเมื่อกดอนุมัติ</p>

      {signatureUrl && (
        <div className="flex flex-col gap-1">
          <Label>ลายเซ็นปัจจุบัน</Label>
          {/* eslint-disable-next-line @next/next/no-img-element -- Drive-hosted, short preview only */}
          <img src={signatureUrl} alt="ลายเซ็นปัจจุบัน" className="h-20 w-fit rounded-lg border border-input bg-white object-contain p-2" />
        </div>
      )}

      <Tabs defaultValue="upload">
        <TabsList>
          <TabsTrigger value="upload" className="gap-1.5">
            <Upload className="h-3.5 w-3.5" /> อัปโหลดรูปภาพ
          </TabsTrigger>
          <TabsTrigger value="draw" className="gap-1.5">
            <PenLine className="h-3.5 w-3.5" /> เซ็นด้วยตัวเอง
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="flex flex-col gap-2">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <Button type="button" size="sm" className="self-start" disabled={!file || isPending} onClick={saveFile}>
            <Save className="h-3.5 w-3.5" /> {isPending ? "กำลังบันทึก..." : "บันทึกลายเซ็น"}
          </Button>
        </TabsContent>

        <TabsContent value="draw">
          <SignaturePad onSave={saveDrawn} isPending={isPending} />
        </TabsContent>
      </Tabs>

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
