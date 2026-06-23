import Link from "next/link";
import { startOfWeek, endOfWeek } from "date-fns";
import {
  CalendarDays,
  Clock,
  Package,
  CalendarRange,
  Users,
  ClipboardList,
  ThumbsUp,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { isDeptHead, roleLabelTh } from "@/lib/rbac";
import { LEAVE_LABELS_TH } from "@/lib/leave";
import { previewWeeklyOt } from "@/lib/ot";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

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
  const canSeeOrgSummary = employee.role === "hr" || employee.role === "admin";
  const isExec = employee.role === "exec";

  let pendingApprovalCount = 0;
  if (canSeeApprovals) {
    // RLS scopes both to the dept_head's own department, or all for admin.
    const [{ count: leaveCount }, { count: fieldCount }] = await Promise.all([
      supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "submitted"),
      supabase.from("field_requests").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    ]);
    pendingApprovalCount = (leaveCount ?? 0) + (fieldCount ?? 0);
  }

  const weeklyOt = await previewWeeklyOt(supabase, employee.id, new Date().toISOString().slice(0, 10));

  const { count: myFieldRequestCount } = await supabase
    .from("field_requests")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", employee.id)
    .in("status", ["submitted", "approved"]);

  let orgSummary: { onLeaveToday: number; submittedThisWeek: number } | null = null;
  if (canSeeOrgSummary) {
    const now = new Date().toISOString();
    const { count: onLeaveToday } = await supabase
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .lte("start_at", now)
      .gte("end_at", now);

    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
    const { count: submittedThisWeek } = await supabase
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .gte("created_at", weekStart)
      .lte("created_at", weekEnd);

    orgSummary = { onLeaveToday: onLeaveToday ?? 0, submittedThisWeek: submittedThisWeek ?? 0 };
  }

  let pendingAckCount = 0;
  if (isExec) {
    const { data: approved } = await supabase
      .from("leave_requests")
      .select("id")
      .eq("status", "approved");
    const approvedIds = (approved ?? []).map((r) => r.id);

    if (approvedIds.length) {
      const { data: myAcks } = await supabase
        .from("approvals")
        .select("entity_id")
        .eq("entity", "leave_requests")
        .eq("action", "acknowledge")
        .eq("actor_id", employee.id)
        .in("entity_id", approvedIds);
      const ackedIds = new Set((myAcks ?? []).map((a) => a.entity_id));
      pendingAckCount = approvedIds.filter((id) => !ackedIds.has(id)).length;
    }
  }

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
                  <span className="text-foreground">{LEAVE_LABELS_TH[b.leave_code] ?? b.leave_code}</span>
                  <span className="font-medium text-foreground">{b.available_days} วัน</span>
                </div>
              ))
            )}
            <Button asChild size="sm" variant="outline" className="mt-1 self-start">
              <Link href="/leave">ยื่นคำขอลา</Link>
            </Button>
          </CardContent>
        </Card>

        {canSeeApprovals && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4 text-primary" /> คำขอรออนุมัติ
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-2xl font-semibold text-foreground">{pendingApprovalCount}</p>
              <Button asChild size="sm" variant="outline" className="self-start">
                <Link href="/leave?tab=approvals">ไปที่หน้าอนุมัติ</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {isExec && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ThumbsUp className="h-4 w-4 text-primary" /> รอรับทราบ
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-2xl font-semibold text-foreground">{pendingAckCount}</p>
              <Button asChild size="sm" variant="outline" className="self-start">
                <Link href="/leave?tab=approvals">ไปที่หน้ารับทราบ</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-primary" /> OT สัปดาห์นี้
            </CardTitle>
            {weeklyOt && (
              <CardDescription>
                {new Date(weeklyOt.week_start).toLocaleDateString("th-TH", { day: "numeric", month: "short" })} –{" "}
                {new Date(weeklyOt.week_end).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-2xl font-semibold text-foreground">{weeklyOt?.week_ot_hours ?? 0} ชม.</p>
            {weeklyOt?.over_36 && (
              <p className="text-sm text-warning">เกิน 36 ชม./สัปดาห์ — โปรดระวัง</p>
            )}
            <Button asChild size="sm" variant="outline" className="self-start">
              <Link href="/field">ดูรายละเอียด</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-primary" /> คำขอนอกสถานที่/WFH ของฉัน
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-2xl font-semibold text-foreground">{myFieldRequestCount ?? 0}</p>
            <Button asChild size="sm" variant="outline" className="self-start">
              <Link href="/field">ยื่นคำขอ</Link>
            </Button>
          </CardContent>
        </Card>

        <PlaceholderCard icon={CalendarRange} title="การจองวันนี้" />
        <PlaceholderCard icon={Package} title="ทรัพย์สินของฉัน" />
        <PlaceholderCard icon={CalendarDays} title="กิจกรรมที่จะถึง" />

        {canSeeOrgSummary && orgSummary && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" /> สรุปทั้งฝ่าย/องค์กร
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">ลาอยู่วันนี้</span>
                <span className="font-medium text-foreground">{orgSummary.onLeaveToday} คน</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">ยื่นคำขอสัปดาห์นี้</span>
                <span className="font-medium text-foreground">{orgSummary.submittedThisWeek} คำขอ</span>
              </div>
            </CardContent>
          </Card>
        )}
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
