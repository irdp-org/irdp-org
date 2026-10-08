import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { Package } from "lucide-react";
import { StockClient, type StockItemRow, type StockTxRow } from "@/components/stock/StockClient";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const employee = await getCurrentEmployee();
  if (!employee) return null;

  const supabase = await createClient();

  const STOCK_DEPT_NAMES = ["ฝึกอบรม", "วิจัยและพัฒนา", "ธุรการ"];
  let hasAccess = employee.role === "admin" || employee.role === "hr";
  if (!hasAccess && employee.department_id) {
    const { data: dept } = await supabase.from("departments").select("name").eq("id", employee.department_id).single();
    hasAccess = !!dept?.name && STOCK_DEPT_NAMES.includes(dept.name);
  }

  if (!hasAccess) {
    return (
      <div>
        <PageHeader title="จัดการสต๊อค" description="สำหรับฝ่ายฝึกอบรม วิจัยและพัฒนา และบัญชี (ธุรการ)" />
        <div className="px-4 md:px-6">
          <EmptyState icon={Package} title="ไม่มีสิทธิ์เข้าถึง" description="หน้านี้ใช้ได้เฉพาะฝ่ายฝึกอบรม วิจัยและพัฒนา บัญชี หรือแอดมิน/HR" />
        </div>
      </div>
    );
  }

  // RLS (fn_can_use_stock) scopes these the same way — the check above is
  // just so the empty state reads correctly rather than looking like "no
  // items yet" for someone who simply isn't allowed on this page.
  const [{ data: items }, { data: txRows }] = await Promise.all([
    supabase.from("stock_items").select("id, name, unit, quantity_on_hand, created_at").order("name"),
    supabase
      .from("stock_transactions")
      .select("id, item_id, employee_id, delta, remaining_after, note, kind, total_price, vendor, purchase_date, project, created_at")
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  const employeeIds = [...new Set((txRows ?? []).map((t) => t.employee_id))];
  const { data: people } = employeeIds.length
    ? await supabase.from("employee_directory").select("id, full_name").in("id", employeeIds)
    : { data: [] };
  const nameById = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  const txByItem = new Map<string, StockTxRow[]>();
  for (const t of txRows ?? []) {
    const list = txByItem.get(t.item_id) ?? [];
    list.push({ ...t, employee_name: nameById.get(t.employee_id) ?? "—" });
    txByItem.set(t.item_id, list);
  }

  const itemRows: StockItemRow[] = (items ?? []).map((i) => ({
    ...i,
    transactions: txByItem.get(i.id) ?? [],
  }));

  return (
    <div>
      <PageHeader title="จัดการสต๊อค" description="สำหรับฝ่ายฝึกอบรม วิจัยและพัฒนา และบัญชี (ธุรการ)" />
      <div className="px-4 md:px-6">
        <StockClient items={itemRows} currentEmployeeName={employee.full_name} canDelete={employee.role === "admin"} />
      </div>
    </div>
  );
}
