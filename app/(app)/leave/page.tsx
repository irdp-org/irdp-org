import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { LeaveRequestsClient, type OwnLeaveRequest } from "@/components/leave/LeaveRequestsClient";

export default async function LeavePage() {
  const employee = await getCurrentEmployee();
  if (!employee) return null; // (app)/layout.tsx already redirects to /pending

  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("leave_requests")
    .select("id, leave_code, start_at, end_at, hours, status, reason")
    .eq("employee_id", employee.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader title="ลา" description="ลาป่วย ลากิจ ลาพักร้อน" />
      <div className="px-4 md:px-6">
        <LeaveRequestsClient requests={(requests ?? []) as OwnLeaveRequest[]} />
      </div>
    </div>
  );
}
