import { PageHeader } from "@/components/shell/PageHeader";
import { QrGenerator } from "@/components/training/QrGenerator";

export default function QrPage() {
  return (
    <div>
      <PageHeader title="สร้าง QR Code" description="ใส่ลิงก์แล้วแปลงเป็นรูป QR พร้อมโลโก้ IRDP" />
      <div className="mx-auto max-w-md px-4 pb-6">
        <QrGenerator />
      </div>
    </div>
  );
}
