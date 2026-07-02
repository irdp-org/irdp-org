import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { RequestTabs } from "@/components/shared/RequestTabs";
import { TravelExpenseClient, type TravelClaim } from "@/components/travel/TravelExpenseClient";
import { TravelApprovalList, type TravelApprovalRow } from "@/components/travel/TravelApprovalList";

export const dynamic = "force-dynamic";

const CAN_SEE_APPROVALS = ["dept_head", "hr", "admin", "exec"];

export default async function TravelExpensePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) return null;

  const supabase = await createClient();

  const { data: claims } = await supabase
    .from("travel_expense_claims")
    .select("id, title, status, total_amount, created_at")
    .eq("employee_id", employee.id)
    .order("created_at", { ascending: false });

  const claimIds = (claims ?? []).map((c) => c.id);
  const { data: items } = claimIds.length
    ? await supabase
        .from("travel_expense_items")
        .select("id, claim_id, travel_date, from_location, to_location, mode, km, amount, note, sort_order")
        .in("claim_id", claimIds)
        .order("sort_order")
    : { data: [] };

  const ownClaims: TravelClaim[] = (claims ?? []).map((c) => ({
    ...c,
    items: (items ?? []).filter((it) => it.claim_id === c.id),
  }));

  const showApprovals = CAN_SEE_APPROVALS.includes(employee.role);
  let approvalRows: TravelApprovalRow[] = [];

  if (showApprovals) {
    const { data: queue } = await supabase
      .from("travel_expense_claims")
      .select("id, employee_id, title, status, total_amount, created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    const rows = queue ?? [];
    const qIds = rows.map((r) => r.id);
    const [{ data: qItems }, { data: people }] = await Promise.all([
      qIds.length
        ? supabase
            .from("travel_expense_items")
            .select("id, claim_id, travel_date, from_location, to_location, mode, km, amount, note, sort_order")
            .in("claim_id", qIds)
            .order("sort_order")
        : Promise.resolve({ data: [] }),
      rows.length
        ? supabase.from("employee_directory").select("id, full_name, department_id").in("id", [...new Set(rows.map((r) => r.employee_id))])
        : Promise.resolve({ data: [] }),
    ]);
    const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));

    approvalRows = rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      total_amount: r.total_amount,
      created_at: r.created_at,
      employee_name: nameById.get(r.employee_id) ?? "—",
      items: (qItems ?? []).filter((it) => it.claim_id === r.id),
    }));
  }

  const { tab } = await searchParams;
  const defaultTab = tab === "approvals" && showApprovals ? "approvals" : "mine";

  return (
    <div>
      <PageHeader title="เบิกค่าเดินทาง" description="บันทึกค่าเดินทางหลายวัน/หลายรูปแบบในเอกสารเดียว" />
      <div className="px-4 md:px-6">
        <RequestTabs
          defaultTab={defaultTab}
          mine={<TravelExpenseClient claims={ownClaims} />}
          approvals={
            showApprovals ? (
              <TravelApprovalList rows={approvalRows} role={employee.role} />
            ) : null
          }
        />
      </div>
    </div>
  );
}
