import { QrGenerator } from "@/components/training/QrGenerator";

export default function QrPage() {
  return (
    <div className="mx-auto max-w-md">
      <h2 className="mb-4 text-base font-semibold text-gray-700">สร้าง QR Code</h2>
      <QrGenerator />
    </div>
  );
}
