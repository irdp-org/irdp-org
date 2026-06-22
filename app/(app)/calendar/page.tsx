import { CalendarRange } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";

export default function CalendarPage() {
  return (
    <div>
      <PageHeader title="ปฏิทิน" description="ปฏิทินองค์กร วันลา และการจอง" />
      <div className="px-4 md:px-6">
        <EmptyState
          icon={CalendarRange}
          title="เร็วๆ นี้"
          description="โมดูลนี้จะเปิดใช้งานในเฟสถัดไป"
        />
      </div>
    </div>
  );
}
