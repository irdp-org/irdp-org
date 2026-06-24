import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { LEAVE_LABELS_TH } from "@/lib/leave";
import { ReportClient, type ReportData } from "@/components/reports/ReportClient";

const ALLOWED = ["hr", "admin", "exec"];

function monthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee || !ALLOWED.includes(employee.role)) redirect("/");

  const { from: fromParam, to: toParam } = await searchParams;
  const defaults = monthRange();
  const from = fromParam ?? defaults.from;
  const to = toParam ?? defaults.to;

  // from/to are date-only strings (yyyy-MM-dd); make inclusive range for timestamptz columns
  const fromTs = `${from}T00:00:00+07:00`;
  const toTs = `${to}T23:59:59+07:00`;

  const supabase = await createClient();

  const [
    { data: leaveRows },
    { data: fieldRows },
    { count: vanCount },
    { count: roomCount },
    { data: assetRows },
    { data: departments },
    { data: employees },
  ] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("employee_id, leave_code, hours")
      .eq("status", "approved")
      .gte("start_at", fromTs)
      .lte("end_at", toTs),
    supabase
      .from("field_requests")
      .select("employee_id, pay_x1_hours, pay_x15_hours, pay_x3_hours, ot_hours")
      .eq("status", "approved")
      .not("ot_hours", "is", null)
      .gte("work_date", from)
      .lte("work_date", to),
    supabase
      .from("van_bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "booked")
      .gte("start_at", fromTs)
      .lte("start_at", toTs),
    supabase
      .from("room_bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "booked")
      .gte("start_at", fromTs)
      .lte("start_at", toTs),
    supabase.from("assets").select("status"),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("employee_directory").select("id, department_id").eq("status", "active"),
  ]);

  // Build employee → dept map
  const empDeptMap = new Map<string, string>(
    (employees ?? []).map((e) => [e.id, e.department_id ?? ""])
  );
  const deptNameMap = new Map<string, string>(
    (departments ?? []).map((d) => [d.id, d.name])
  );

  // ── Leave aggregation ─────────────────────────────────────────────────────
  const leaveByTypeMap = new Map<string, number>();
  const leaveByDeptMap = new Map<string, number>();
  let totalLeaveHours = 0;

  for (const r of leaveRows ?? []) {
    const h = r.hours ?? 0;
    totalLeaveHours += h;
    leaveByTypeMap.set(r.leave_code, (leaveByTypeMap.get(r.leave_code) ?? 0) + h);
    const deptId = empDeptMap.get(r.employee_id) ?? "";
    const deptName = deptNameMap.get(deptId) ?? "ไม่ระบุ";
    leaveByDeptMap.set(deptName, (leaveByDeptMap.get(deptName) ?? 0) + h);
  }

  const leaveByType = [...leaveByTypeMap.entries()]
    .map(([code, value]) => ({ name: LEAVE_LABELS_TH[code as keyof typeof LEAVE_LABELS_TH] ?? code, value }))
    .sort((a, b) => b.value - a.value);

  const leaveByDept = [...leaveByDeptMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // ── OT aggregation ────────────────────────────────────────────────────────
  const otDeptMap = new Map<string, { x1: number; x15: number; x3: number }>();
  let totalOtHours = 0;
  const otTotals = { x1: 0, x15: 0, x3: 0 };

  for (const r of fieldRows ?? []) {
    const x1 = r.pay_x1_hours ?? 0;
    const x15 = r.pay_x15_hours ?? 0;
    const x3 = r.pay_x3_hours ?? 0;
    totalOtHours += x1 + x15 + x3;
    otTotals.x1 += x1;
    otTotals.x15 += x15;
    otTotals.x3 += x3;
    const deptId = empDeptMap.get(r.employee_id) ?? "";
    const deptName = deptNameMap.get(deptId) ?? "ไม่ระบุ";
    const prev = otDeptMap.get(deptName) ?? { x1: 0, x15: 0, x3: 0 };
    otDeptMap.set(deptName, { x1: prev.x1 + x1, x15: prev.x15 + x15, x3: prev.x3 + x3 });
  }

  const otByDept = [...otDeptMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.x1 + b.x15 + b.x3 - (a.x1 + a.x15 + a.x3));

  // ── Asset counts ──────────────────────────────────────────────────────────
  const assets = { in_stock: 0, assigned: 0, broken: 0, disposed: 0 };
  for (const a of assetRows ?? []) {
    if (a.status in assets) assets[a.status as keyof typeof assets]++;
  }

  const data: ReportData = {
    leaveByType,
    leaveByDept,
    otByDept,
    otTotals,
    vanBookings: vanCount ?? 0,
    roomBookings: roomCount ?? 0,
    assets,
    totalLeaveHours: Math.round(totalLeaveHours * 10) / 10,
    totalOtHours: Math.round(totalOtHours * 10) / 10,
  };

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader title="รีพอร์ต" description="สรุปข้อมูลข้ามโมดูล" />
      <div className="px-4 md:px-6">
        <ReportClient from={from} to={to} data={data} />
      </div>
    </div>
  );
}
