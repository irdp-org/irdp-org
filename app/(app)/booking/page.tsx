import { CalendarPlus } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";

export default function BookingPage() {
  return (
    <div>
      <PageHeader title="จอง" description="จองรถตู้และห้องประชุม" />
      <div className="px-4 md:px-6">
        <EmptyState
          icon={CalendarPlus}
          title="เร็วๆ นี้"
          description="โมดูลนี้จะเปิดใช้งานในเฟสถัดไป"
        />
      </div>
    </div>
  );
}
