"use client";

import { useState, useRef, useCallback } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Download, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const LOGO_PATH = "/logo/LOGO_IRDP_FULL_ENG.jpg";

export function QrGenerator() {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const qrValue = url.trim() || "https://irdp.or.th";

  // Download the QR canvas as PNG
  const handleDownload = useCallback(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#qr-canvas canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "IRDP_QRCode.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, []);

  // Copy QR image to clipboard
  const handleCopy = useCallback(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#qr-canvas canvas");
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // fallback: open in new tab
        const url = canvas.toDataURL();
        window.open(url, "_blank");
      }
    });
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {/* URL input */}
      <div className="rounded-xl border border-border bg-surface px-4 py-4 flex flex-col gap-3">
        <label className="text-sm font-medium text-muted-foreground">ลิงก์หรือข้อความ</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/..."
          className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        />
        <p className="text-xs text-muted-foreground">
          พิมพ์ลิงก์หรือข้อความ QR จะสร้างอัตโนมัติ
        </p>
      </div>

      {/* QR preview */}
      <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-white px-6 py-8">
        <div id="qr-canvas">
          <QRCodeCanvas
            value={qrValue}
            size={240}
            level="H"
            marginSize={2}
            imageSettings={{
              src: LOGO_PATH,
              height: 52,
              width: 52,
              excavate: true,
            }}
          />
        </div>
        <p className="max-w-[240px] break-all text-center text-xs text-muted-foreground">
          {qrValue}
        </p>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          {copied ? "คัดลอกแล้ว!" : "คัดลอกรูป"}
        </Button>
        <Button
          type="button"
          className="gap-2 bg-blue-600 hover:bg-blue-700"
          onClick={handleDownload}
        >
          <Download className="h-4 w-4" />
          ดาวน์โหลด PNG
        </Button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        รูป QR จะมีโลโก้ IRDP อยู่ตรงกลาง พร้อมนำไปใช้ในเอกสารได้เลย
      </p>
    </div>
  );
}
