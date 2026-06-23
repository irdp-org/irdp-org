import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { LeaveRequestsClient, type OwnLeaveRequest } from "@/components/leave/LeaveRequestsClient";
import { ApprovalList, type ApprovalQueueRow } from "@/components/leave/ApprovalList";
import { LeaveTabs } from "@/components/leave/LeaveTabs";

const CAN_SEE_APPROVALS = ["dept_head", "hr", "admin", "exec"];

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) return null; // (app)/layout.tsx already redirects to /pending

  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("leave_requests")
    .select("id, leave_code, start_at, end_at, hours, status, reason")
    .eq("employee_id", employee.id)
    .order("created_at", { ascending: false });

  const returnedIds = (requests ?? []).filter((r) => r.status === "returned").map((r) => r.id);
  const { data: returnNotes } = returnedIds.length
    ? await supabase
        .from("approvals")
        .select("entity_id, note, created_at")
        .eq("entity", "leave_requests")
        .eq("action", "return")
        .in("entity_id", returnedIds)
        .order("created_at", { ascending: false })
    : { data: [] };
  // Latest note per request — results are already ordered desc, so the
  // first one seen per entity_id wins.
  const latestReturnNoteById = new Map<string, string | null>();
  for (const n of returnNotes ?? []) {
    if (!latestReturnNoteById.has(n.entity_id)) latestReturnNoteById.set(n.entity_id, n.note);
  }

  const ownRequests: OwnLeaveRequest[] = (requests ?? []).map((r) => ({
    ...r,
    returnNote: latestReturnNoteById.get(r.id) ?? null,
  }));

  const showApprovals = CAN_SEE_APPROVALS.includes(employee.role);
  let approvalRows: ApprovalQueueRow[] = [];

  if (showApprovals) {
    // RLS already scopes this correctly: dept_head -> own department,
    // hr/admin/exec -> everyone.
    const { data: queue } = await supabase
      .from("leave_requests")
      .select("id, employee_id, leave_code, start_at, end_at, hours, status, reason")
      .order("created_at", { ascending: false })
      .limit(100);

    const requestRows = queue ?? [];
    const approvedIds = requestRows.filter((r) => r.status === "approved").map((r) => r.id);

    const { data: acks } = approvedIds.length
      ? await supabase
          .from("approvals")
          .select("entity_id, actor_id, created_at")
          .eq("entity", "leave_requests")
          .eq("action", "acknowledge")
          .in("entity_id", approvedIds)
      : { data: [] };

    const employeeIds = Array.from(
      new Set([...requestRows.map((r) => r.employee_id), ...(acks ?? []).map((a) => a.actor_id)])
    );
    const { data: people } = employeeIds.length
      ? await supabase
          .from("employee_directory")
          .select("id, full_name, department_id")
          .in("id", employeeIds)
      : { data: [] };
    const peopleById = new Map((people ?? []).map((p) => [p.id, p]));

    approvalRows = requestRows.map((r) => ({
      id: r.id,
      leave_code: r.leave_code,
      start_at: r.start_at,
      end_at: r.end_at,
      hours: r.hours,
      status: r.status,
      reason: r.reason,
      employee: {
        id: r.employee_id,
        full_name: peopleById.get(r.employee_id)?.full_name ?? "—",
        department_id: peopleById.get(r.employee_id)?.department_id ?? null,
      },
      acknowledgements: (acks ?? [])
        .filter((a) => a.entity_id === r.id)
        .map((a) => ({
          actor_id: a.actor_id,
          actor_name: peopleById.get(a.actor_id)?.full_name ?? "—",
          created_at: a.created_at,
        })),
    }));
  }

  const { tab } = await searchParams;
  const defaultTab = tab === "approvals" && showApprovals ? "approvals" : "mine";

  return (
    <div>
      <PageHeader title="ลา" description="ลาป่วย ลากิจ ลาพักร้อน" />
      <div className="px-4 md:px-6">
        <LeaveTabs
          defaultTab={defaultTab}
          mine={<LeaveRequestsClient requests={ownRequests} />}
          approvals={
            showApprovals ? (
              <ApprovalList rows={approvalRows} role={employee.role} currentEmployeeId={employee.id} />
            ) : null
          }
        />
      </div>
    </div>
  );
}
