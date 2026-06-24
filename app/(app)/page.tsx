import Link from "next/link";
import { startOfWeek, endOfWeek } from "date-fns";
import {
  CalendarDays,
  Clock,
  Package,
  Users,
  ClipboardList,
  ThumbsUp,
  MapPin,
  Bus,
  BarChart2,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { isDeptHead, roleLabelTh } from "@/lib/rbac";
import { LEAVE_LABELS_TH } from "@/lib/leave";
import { previewWeeklyOt } from "@/lib/ot";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function DashboardPage() {
  const employee = await getCurrentEmployee();
  if (!employee) return null; // (app)/layout.tsx already redirects to /pending

  const supabase = await createClient();
  const year = new Date().getFullYear();
  const [{ data: balances }, { data: dept }] = await Promise.all([
    supabase
      .from("leave_balance_view")
      .select("leave_code, available_days, available_hours")
      .eq("employee_id", employee.id)
      .eq("year", year),
    employee.department_id
      ? supabase.from("departments").select("name").eq("id", employee.department_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

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

  // Today's bookings (visible to everyone per RLS)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const [{ count: vanTodayCount }, { count: roomTodayCount }] = await Promise.all([
    supabase
      .from("van_bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "booked")
      .gte("start_at", todayStart.toISOString())
      .lte("start_at", todayEnd.toISOString()),
    supabase
      .from("room_bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "booked")
      .gte("start_at", todayStart.toISOString())
      .lte("start_at", todayEnd.toISOString()),
  ]);

  const { count: myFieldRequestCount } = await supabase
    .from("field_requests")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", employee.id)
    .in("status", ["submitted", "approved"]);

  // My assets summary
  const { data: myAssignments } = await supabase
    .from("asset_assignments")
    .select("id, status")
    .eq("employee_id", employee.id)
    .in("status", ["pending_accept", "accepted"]);
  const myAssetStats = {
    pending: (myAssignments ?? []).filter((a) => a.status === "pending_accept").length,
    accepted: (myAssignments ?? []).filter((a) => a.status === "accepted").length,
  };

  // Driver card: check if current employee is a vehicle driver
  const { data: myVehicle } = await supabase
    .from("vehicles")
    .select("id, name")
    .eq("driver_id", employee.id)
    .eq("active", true)
    .maybeSingle();

  let driverTodayCount = 0;
  let driverWeekCount = 0;
  if (myVehicle) {
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 }).toISOString();
    const [{ count: dToday }, { count: dWeek }] = await Promise.all([
      supabase
        .from("van_bookings")
        .select("id", { count: "exact", head: true })
        .eq("vehicle_id", myVehicle.id)
        .eq("status", "booked")
        .gte("start_at", todayStart.toISOString())
        .lte("start_at", todayEnd.toISOString()),
      supabase
        .from("van_bookings")
        .select("id", { count: "exact", head: true })
        .eq("vehicle_id", myVehicle.id)
        .eq("status", "booked")
        .gte("end_at", new Date().toISOString())
        .lte("start_at", weekEnd),
    ]);
    driverTodayCount = dToday ?? 0;
    driverWeekCount = dWeek ?? 0;
  }

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
    const [{ data: approvedLeave }, { data: approvedField }] = await Promise.all([
      supabase.from("leave_requests").select("id").eq("status", "approved"),
      supabase.from("field_requests").select("id").eq("status", "approved"),
    ]);
    const leaveIds = (approvedLeave ?? []).map((r) => r.id);
    const fieldIds = (approvedField ?? []).map((r) => r.id);

    const [leaveAcks, fieldAcks] = await Promise.all([
      leaveIds.length
        ? supabase
            .from("approvals")
            .select("entity_id")
            .eq("entity", "leave_requests")
            .eq("action", "acknowledge")
            .eq("actor_id", employee.id)
            .in("entity_id", leaveIds)
        : Promise.resolve({ data: [] }),
      fieldIds.length
        ? supabase
            .from("approvals")
            .select("entity_id")
            .eq("entity", "field_requests")
            .eq("action", "acknowledge")
            .eq("actor_id", employee.id)
            .in("entity_id", fieldIds)
        : Promise.resolve({ data: [] }),
    ]);

    const ackedLeave = new Set((leaveAcks.data ?? []).map((a) => a.entity_id));
    const ackedField = new Set((fieldAcks.data ?? []).map((a) => a.entity_id));
    pendingAckCount =
      leaveIds.filter((id) => !ackedLeave.has(id)).length +
      fieldIds.filter((id) => !ackedField.has(id)).length;
  }

  // Admin stats
  let adminStats: { activeEmployees: number; overdueAssets: number } | null = null;
  if (employee.role === "admin") {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [{ count: empCount }, { count: overdueCount }] = await Promise.all([
      supabase.from("employee_directory").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase
        .from("asset_assignments")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_accept")
        .lte("assigned_at", sevenDaysAgo),
    ]);
    adminStats = { activeEmployees: empCount ?? 0, overdueAssets: overdueCount ?? 0 };
  }

  // Upcoming calendar events (next 7 days, RLS-scoped per role)
  const next7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: upcomingEvents } = await supabase
    .from("calendar_events")
    .select("id, title, type, start_at, end_at")
    .gte("start_at", new Date().toISOString())
    .lte("start_at", next7)
    .order("start_at")
    .limit(5);

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        title={`สวัสดี ${employee.full_name}`}
        description={[employee.position, dept?.name].filter(Boolean).join(" · ") || roleLabelTh[employee.role]}
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bus className="h-4 w-4 text-primary" /> การจองวันนี้
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">รถตู้</span>
              <span className="font-medium text-foreground">{vanTodayCount ?? 0} คัน</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">ห้องประชุม</span>
              <span className="font-medium text-foreground">{roomTodayCount ?? 0} รายการ</span>
            </div>
            <Button asChild size="sm" variant="outline" className="mt-1 self-start">
              <Link href="/booking">ดูปฏิทินจอง</Link>
            </Button>
          </CardContent>
        </Card>
        {myVehicle && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bus className="h-4 w-4 text-primary" /> งานขับรถของฉัน
              </CardTitle>
              <CardDescription>{myVehicle.name}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">วันนี้</span>
                <span className="font-medium text-foreground">{driverTodayCount} เที่ยว</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">สัปดาห์นี้</span>
                <span className="font-medium text-foreground">{driverWeekCount} เที่ยว</span>
              </div>
              <Button asChild size="sm" variant="outline" className="mt-1 self-start">
                <Link href="/booking">ดูปฏิทินรถ</Link>
              </Button>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 text-primary" /> ทรัพย์สินของฉัน
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {myAssetStats.pending > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-warning">รอยืนยัน</span>
                <span className="font-medium text-warning">{myAssetStats.pending} ชิ้น</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">ครอบครองอยู่</span>
              <span className="font-medium text-foreground">{myAssetStats.accepted} ชิ้น</span>
            </div>
            <Button asChild size="sm" variant="outline" className="mt-1 self-start">
              <Link href="/assets">ดูทรัพย์สิน</Link>
            </Button>
          </CardContent>
        </Card>
        {/* Upcoming events card (C-4) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-primary" /> กิจกรรมที่จะถึง
            </CardTitle>
            <CardDescription>7 วันข้างหน้า</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {!upcomingEvents?.length ? (
              <p className="text-sm text-muted-foreground">ไม่มีกิจกรรมในช่วงนี้</p>
            ) : (
              upcomingEvents.map((ev) => (
                <div key={ev.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <div className="flex flex-col gap-0 min-w-0">
                    <span className="truncate font-medium text-foreground">{ev.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(ev.start_at).toLocaleDateString("th-TH", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Bangkok",
                      })}
                    </span>
                  </div>
                </div>
              ))
            )}
            <Button asChild size="sm" variant="outline" className="mt-1 self-start">
              <Link href="/calendar">ดูปฏิทิน</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Admin stats card (C-3) */}
        {adminStats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" /> สถิติระบบ
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">พนักงาน (active)</span>
                <span className="font-medium text-foreground">{adminStats.activeEmployees} คน</span>
              </div>
              {adminStats.overdueAssets > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-warning">ทรัพย์สินรอยืนยัน {">"} 7 วัน</span>
                  <span className="font-medium text-warning">{adminStats.overdueAssets} ชิ้น</span>
                </div>
              )}
              <Button asChild size="sm" variant="outline" className="mt-1 self-start">
                <Link href="/admin/assets">ดูคลังทรัพย์สิน</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Org summary (C-2: add /reports link) */}
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
              <Button asChild size="sm" variant="outline" className="mt-1 self-start">
                <Link href="/reports">
                  <BarChart2 className="h-4 w-4" /> ดูรีพอร์ต
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

