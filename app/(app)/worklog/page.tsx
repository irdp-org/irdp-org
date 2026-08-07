import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { WorkLogClient, type OwnWorkLog } from "@/components/worklog/WorkLogClient";

export default async function WorkLogPage() {
  const employee = await getCurrentEmployee();
  if (!employee) return null; // (app)/layout.tsx already redirects to /pending

  const supabase = await createClient();
  const { data: logs } = await supabase
    .from("work_logs")
    .select("id, work_date, start_time, end_time, tasks")
    .eq("employee_id", employee.id)
    .order("work_date", { ascending: false });

  return (
    <div>
      <PageHeader title="บันทึกเวลาทำงาน" description="บันทึกเวลาเข้า-เลิกงานและงานที่ทำในแต่ละวัน (บันทึกย้อนหลังได้ ไม่ต้องรออนุมัติ)" />
      <div className="px-4 md:px-6">
        <WorkLogClient logs={(logs ?? []) as OwnWorkLog[]} />
      </div>
    </div>
  );
}
