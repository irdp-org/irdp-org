import { MapPin } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";

export default function FieldPage() {
  return (
    <div>
      <PageHeader title="นอกสถานที่ / OT / WFH" description="เช็คอินนอกสถานที่ ขอ OT และ Work from Anywhere" />
      <div className="px-4 md:px-6">
        <EmptyState
          icon={MapPin}
          title="เร็วๆ นี้"
          description="โมดูลนี้จะเปิดใช้งานในเฟสถัดไป"
        />
      </div>
    </div>
  );
}
