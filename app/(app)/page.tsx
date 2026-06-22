import {
  CalendarDays,
  Clock,
  Package,
  CalendarRange,
  Users,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { isOversight, isDeptHead, roleLabelTh } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const LEAVE_LABELS: Record<string, string> = {
  sick: "ลาป่วย",
  personal: "ลากิจ",
  vacation: "ลาพักร้อน",
};

export default async function DashboardPage() {
  const employee = await getCurrentEmployee();
  if (!employee) return null; // (app)/layout.tsx already redirects to /pending

  const supabase = await createClient();
  const year = new Date().getFullYear();
  const { data: balances } = await supabase
    .from("leave_balance_view")
    .select("leave_code, available_days, available_hours")
    .eq("employee_id", employee.id)
    .eq("year", year);

  const canSeeApprovals = isDeptHead(employee.role) || employee.role === "admin";
  const canSeeOrgSummary = isOversight(employee.role);

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        title="หน้าหลัก"
        description={`สวัสดี ${employee.full_name} (${roleLabelTh[employee.role]})`}
      />
      <div className="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2 md:px-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-primary" /> วันลาคงเหลือของฉัน
            </CardTitle>
            <CardDescription>ปี {year}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {!balances?.length ? (
              <p className="text-sm text-muted-foreground">
                ยังไม่มีข้อมูลโควต้าลา (จะคำนวณอัตโนมัติเมื่อมีการยื่นคำขอลาครั้งแรก)
              </p>
            ) : (
              balances.map((b) => (
                <div key={b.leave_code} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{LEAVE_LABELS[b.leave_code] ?? b.leave_code}</span>
                  <span className="font-medium text-foreground">{b.available_days} วัน</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {canSeeApprovals && <PlaceholderCard icon={ClipboardList} title="คำขอรออนุมัติ" />}
        <PlaceholderCard icon={CalendarRange} title="การจองวันนี้" />
        <PlaceholderCard icon={Package} title="ทรัพย์สินของฉัน" />
        <PlaceholderCard icon={Clock} title="OT เดือนนี้" />
        <PlaceholderCard icon={CalendarDays} title="กิจกรรมที่จะถึง" />
        {canSeeOrgSummary && <PlaceholderCard icon={Users} title="สรุปทั้งฝ่าย/องค์กร" />}
      </div>
    </div>
  );
}

function PlaceholderCard({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyState title="เร็วๆ นี้" />
      </CardContent>
    </Card>
  );
}
