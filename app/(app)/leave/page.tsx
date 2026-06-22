import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";

export default function LeavePage() {
  return (
    <div>
      <PageHeader title="ลา" description="ลาป่วย ลากิจ ลาพักร้อน" />
      <div className="px-4 md:px-6">
        <EmptyState
          icon={CalendarDays}
          title="เร็วๆ นี้"
          description="โมดูลระบบลาจะเปิดใช้งานในเฟสถัดไป"
        />
      </div>
    </div>
  );
}
