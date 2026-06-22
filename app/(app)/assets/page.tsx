import { Package } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";

export default function AssetsPage() {
  return (
    <div>
      <PageHeader title="ทรัพย์สิน" description="ทรัพย์สิน/อุปกรณ์สำนักงานที่รับผิดชอบ" />
      <div className="px-4 md:px-6">
        <EmptyState
          icon={Package}
          title="เร็วๆ นี้"
          description="โมดูลนี้จะเปิดใช้งานในเฟสถัดไป"
        />
      </div>
    </div>
  );
}
